import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectRoot } from '../../platform/paths.js';
import { readPackageVersion } from '../../platform/version.js';
import { createLogger } from '../../kernel/logger.js';
import { AppError, ErrorCode } from '../../kernel/errors.js';
import { isReleaseTag, isNewer } from './semver.js';
import { Phase, writeState } from './update_state.js';
import { scheduleRestart } from './update_service.js';

const run = promisify(execFile);
const log = createLogger('zip-bundle');

const BACKUP_ENTRIES = Object.freeze([
    'src', 'web', 'bin', 'deploy', 'vision', 'shield',
    'package.json', 'package-lock.json', 'AGENTS.md',
    'README.md', 'LICENSE', 'autoinstaller.sh'
]);

export function isZipFile(filePath) {
    return typeof filePath === 'string' && filePath.toLowerCase().endsWith('.zip');
}

export function findExtractedRoot(dir, depth = 0) {
    if (depth > 3) return null;
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) return dir;
    try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                const found = findExtractedRoot(path.join(dir, entry.name), depth + 1);
                if (found) return found;
            }
        }
    } catch {
        return null;
    }
    return null;
}

export async function extractZip(zipFile, destDir) {
    fs.mkdirSync(destDir, { recursive: true });

    try {
        const cmd = process.platform === 'win32' ? 'tar.exe' : 'tar';
        await run(cmd, ['-xf', zipFile, '-C', destDir], {
            windowsHide: true,
            shell: false,
            timeout: 60000
        });
        return;
    } catch {
        if (process.platform === 'win32') {
            const script = `Expand-Archive -LiteralPath '${zipFile.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
            await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
                windowsHide: true,
                shell: false,
                timeout: 120000
            }).catch((error) => {
                throw new AppError(ErrorCode.DEPENDENCY, 'Decompressione dell archivio zip fallita', { cause: error });
            });
            return;
        }

        await run('unzip', ['-q', '-o', zipFile, '-d', destDir], {
            windowsHide: true,
            shell: false,
            timeout: 60000
        }).catch((error) => {
            throw new AppError(ErrorCode.DEPENDENCY, 'Decompressione dell archivio zip fallita', { cause: error });
        });
    }
}

export function copyDirectory(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

export function copyPreservedFiles(fromDir, toDir) {
    for (const entry of BACKUP_ENTRIES) {
        const sourcePath = path.join(fromDir, entry);
        if (!fs.existsSync(sourcePath)) continue;

        const stat = fs.statSync(sourcePath);
        const targetPath = path.join(toDir, entry);
        if (stat.isDirectory()) {
            copyDirectory(sourcePath, targetPath);
        } else {
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.copyFileSync(sourcePath, targetPath);
        }
    }
}

export async function inspectZipPackage(zipPath, config) {
    const stats = fs.statSync(zipPath);
    const dataDir = config?.dataDir || path.join(projectRoot, 'data');
    const tempInspectDir = path.join(dataDir, 'updates', 'staging', `inspect-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);

    try {
        await extractZip(zipPath, tempInspectDir);
        const root = findExtractedRoot(tempInspectDir);
        if (!root) {
            throw new AppError(ErrorCode.VALIDATION, 'Nessun file package.json trovato all interno dell archivio');
        }

        const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        if (pkgJson.name !== 'argus-pr') {
            throw new AppError(ErrorCode.VALIDATION, `Nome pacchetto non valido: atteso argus-pr, trovato ${pkgJson.name}`);
        }

        const rawVersion = pkgJson.version ?? '';
        const tag = rawVersion.startsWith('v') ? rawVersion : `v${rawVersion}`;
        if (!isReleaseTag(tag)) {
            throw new AppError(ErrorCode.VALIDATION, `Versione non valida nel package.json: ${rawVersion}`);
        }

        const hash = crypto.createHash('sha256');
        hash.update(fs.readFileSync(zipPath));
        const sha256 = hash.digest('hex');

        return {
            path: zipPath,
            name: path.basename(zipPath),
            tag,
            sizeBytes: stats.size,
            modifiedAt: stats.mtime.toISOString(),
            sha256,
            isZip: true,
            refs: [`refs/tags/${tag}`],
            newer: isNewer(tag, readPackageVersion())
        };
    } finally {
        try {
            if (fs.existsSync(tempInspectDir)) fs.rmSync(tempInspectDir, { recursive: true, force: true });
        } catch {}
    }
}

async function runNpm(args, cwd) {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    return run(npmCmd, args, {
        cwd,
        windowsHide: true,
        shell: process.platform === 'win32',
        timeout: 120000,
        maxBuffer: 2 * 1024 * 1024
    });
}

export async function applyZipPackage(config, zipPath, targetTag, { force = false } = {}) {
    const previousVersion = readPackageVersion();
    const updatesDir = path.join(config.dataDir, 'updates');
    const stagingDir = path.join(updatesDir, 'staging', `apply-${Date.now()}`);
    const backupDir = path.join(updatesDir, 'backup');

    log.warn('applying zip package update', { target: targetTag, from: previousVersion, force });

    try {
        await extractZip(zipPath, stagingDir);
        const extractedRoot = findExtractedRoot(stagingDir);
        if (!extractedRoot) {
            throw new AppError(ErrorCode.VALIDATION, 'Impossibile individuare i file di programma nell archivio');
        }

        if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
        fs.mkdirSync(backupDir, { recursive: true });
        copyPreservedFiles(projectRoot, backupDir);
        fs.writeFileSync(path.join(backupDir, 'backup.json'), JSON.stringify({ version: previousVersion, targetRef: targetTag }));

        copyPreservedFiles(extractedRoot, projectRoot);

        try {
            await runNpm(['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], projectRoot);
            await run(process.execPath, ['-e', 'import("better-sqlite3")'], {
                cwd: projectRoot,
                windowsHide: true,
                shell: false,
                timeout: 10000
            }).catch(async () => {
                await runNpm(['rebuild', 'better-sqlite3', '--build-from-source', '--loglevel=error'], projectRoot).catch(() => {});
            });
        } catch (error) {
            log.warn('npm install warning during zip update', { message: error.message });
        }

        const next = writeState(config, {
            phase: Phase.PENDING,
            targetRef: targetTag,
            previousVersion,
            attempts: 1,
            appliedAt: new Date().toISOString(),
            message: `Aggiornamento applicato da archivio ${path.basename(zipPath)}`
        });

        log.info('zip update files applied, scheduling restart', { target: targetTag });
        scheduleRestart();

        return { state: next, outcome: 'upgrading', target: targetTag };
    } finally {
        try {
            if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
        } catch {}
    }
}
