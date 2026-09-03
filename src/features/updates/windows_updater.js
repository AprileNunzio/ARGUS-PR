import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { projectRoot } from '../../platform/paths.js';
import { readPackageVersion } from '../../platform/version.js';
import { createLogger } from '../../kernel/logger.js';
import { AppError, ErrorCode } from '../../kernel/errors.js';
import { isReleaseTag } from './semver.js';
import { Phase, readState, writeState, quarantine } from './update_state.js';
import { scheduleRestart } from './update_service.js';

const run = promisify(execFile);
const log = createLogger('windows-updater');

const MAX_ATTEMPTS = 2;
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const BACKUP_ENTRIES = [
    'src', 'web', 'bin', 'deploy', 'vision', 'shield',
    'package.json', 'package-lock.json', 'AGENTS.md',
    'README.md', 'LICENSE', 'autoinstaller.sh'
];

function isGitInstall() {
    return fs.existsSync(path.join(projectRoot, '.git'));
}

function resolveNpmCli() {
    const nodeDir = path.dirname(process.execPath);
    const candidate = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (fs.existsSync(candidate)) return candidate;
    return null;
}

async function runNpm(args, cwd) {
    const npmCli = resolveNpmCli();
    if (npmCli) {
        return run(process.execPath, [npmCli, ...args], {
            cwd,
            windowsHide: true,
            shell: false,
            timeout: 120000,
            maxBuffer: 2 * 1024 * 1024
        });
    }

    return run('npm.cmd', args, {
        cwd,
        windowsHide: true,
        shell: true,
        timeout: 120000,
        maxBuffer: 2 * 1024 * 1024
    });
}

function copyDirectory(src, dest) {
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

function copyPreservedFiles(fromDir, toDir) {
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

async function downloadReleaseArchive(targetRef, destFile) {
    const url = `https://github.com/AprileNunzio/ARGUS-PR/archive/refs/tags/${targetRef}.zip`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(url, {
        signal: controller.signal,
        headers: {
            'user-agent': 'argus-pr-updater',
            accept: 'application/zip, application/octet-stream'
        }
    }).catch((error) => {
        throw new AppError(ErrorCode.DEPENDENCY, 'Impossibile scaricare l\'aggiornamento da GitHub', { cause: error });
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
        throw new AppError(ErrorCode.DEPENDENCY, `Download fallito: GitHub ha risposto ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_ARCHIVE_BYTES) {
        throw new AppError(ErrorCode.DEPENDENCY, 'Archivio di aggiornamento troppo grande');
    }

    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.writeFileSync(destFile, buffer);
}

async function extractZip(zipFile, destDir) {
    fs.mkdirSync(destDir, { recursive: true });

    try {
        await run('tar.exe', ['-xf', zipFile, '-C', destDir], {
            windowsHide: true,
            shell: false,
            timeout: 30000
        });
        return;
    } catch {
        const script = `Expand-Archive -LiteralPath '${zipFile.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
        await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
            windowsHide: true,
            shell: false,
            timeout: 60000
        }).catch((error) => {
            throw new AppError(ErrorCode.DEPENDENCY, 'Decompressione dell\'aggiornamento fallita', { cause: error });
        });
    }
}

function findExtractedRoot(stagingDir) {
    const children = fs.readdirSync(stagingDir, { withFileTypes: true });
    for (const child of children) {
        if (!child.isDirectory()) continue;
        const candidate = path.join(stagingDir, child.name);
        if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    }
    if (fs.existsSync(path.join(stagingDir, 'package.json'))) return stagingDir;
    throw new AppError(ErrorCode.DEPENDENCY, 'Struttura dell\'archivio non valida');
}

async function applyGitUpdate(targetRef) {
    await run('git', ['-C', projectRoot, 'fetch', '--tags', '--force', '--prune', '--quiet', 'origin'], {
        windowsHide: true,
        shell: false,
        timeout: 30000
    });

    await run('git', ['-C', projectRoot, '-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--force', targetRef], {
        windowsHide: true,
        shell: false,
        timeout: 20000
    });
}

export async function applyWindowsUpdate(config, targetRef) {
    if (!isReleaseTag(targetRef)) {
        throw new AppError(ErrorCode.VALIDATION, 'Riferimento non valido: ammessi solo tag vX.Y.Z');
    }

    const previousVersion = readPackageVersion();
    const updatesDir = path.join(config.dataDir, 'updates');
    const downloadsDir = path.join(updatesDir, 'downloads');
    const stagingDir = path.join(updatesDir, 'staging');
    const backupDir = path.join(updatesDir, 'backup');

    log.warn('applying windows update', { target: targetRef, from: previousVersion });

    if (isGitInstall()) {
        await applyGitUpdate(targetRef);
    } else {
        const zipFile = path.join(downloadsDir, `${targetRef}.zip`);
        await downloadReleaseArchive(targetRef, zipFile);

        if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
        await extractZip(zipFile, stagingDir);

        const extractedRoot = findExtractedRoot(stagingDir);

        if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
        fs.mkdirSync(backupDir, { recursive: true });
        copyPreservedFiles(projectRoot, backupDir);
        fs.writeFileSync(path.join(backupDir, 'backup.json'), JSON.stringify({ version: previousVersion, targetRef }));

        copyPreservedFiles(extractedRoot, projectRoot);

        try {
            fs.rmSync(stagingDir, { recursive: true, force: true });
            fs.rmSync(zipFile, { force: true });
        } catch {}
    }

    try {
        await runNpm(['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], projectRoot);
    } catch (error) {
        log.warn('npm install warning during update', { message: error.message });
    }

    writeState(config, {
        phase: Phase.PENDING,
        targetRef,
        previousVersion,
        attempts: 1,
        appliedAt: new Date().toISOString(),
        message: null
    });

    log.info('windows update files staged, restarting service', { target: targetRef });
    scheduleRestart();

    return { outcome: 'upgrading', target: targetRef };
}

export function handleWindowsStartup(config) {
    const state = readState(config);
    if (state.phase !== Phase.PENDING) return;

    const currentAttempts = Number(state.attempts) || 0;
    const nextAttempts = currentAttempts + 1;

    if (nextAttempts > MAX_ATTEMPTS) {
        log.error('new version failed to stabilize, rolling back', {
            target: state.targetRef,
            attempts: nextAttempts
        });

        const updatesDir = path.join(config.dataDir, 'updates');
        const backupDir = path.join(updatesDir, 'backup');

        if (!isGitInstall() && fs.existsSync(backupDir)) {
            try {
                copyPreservedFiles(backupDir, projectRoot);
                void runNpm(['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], projectRoot);
            } catch (error) {
                log.error('restore from backup failed', { message: error.message });
            }
        }

        if (state.targetRef) quarantine(config, state.targetRef);

        writeState(config, {
            phase: Phase.ROLLED_BACK,
            attempts: 0,
            automatic: false,
            message: 'Ripristino automatico: la nuova versione non si e avviata'
        });
    } else {
        writeState(config, { attempts: nextAttempts });
    }
}
