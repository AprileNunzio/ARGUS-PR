import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';

function diskStats(targetPath) {
    try {
        const stat = fs.statfsSync(targetPath);
        const totalBytes = Number(stat.blocks) * Number(stat.bsize);
        const freeBytes = Number(stat.bavail) * Number(stat.bsize);
        const usedBytes = totalBytes - freeBytes;
        const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;
        return { totalBytes, freeBytes, usedBytes, usedPercent };
    } catch {
        return null;
    }
}

function parseLinuxMdstat() {
    const mdstatPath = '/proc/mdstat';
    if (!fs.existsSync(mdstatPath)) return [];

    const content = fs.readFileSync(mdstatPath, 'utf8');
    const arrays = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(/^(md\d+)\s*:\s*(\w+)\s*(\w+)\s+(.+)$/);
        if (match) {
            const [, name, state, level, devicesStr] = match;
            const devices = devicesStr.split(/\s+/).map((d) => d.replace(/\[\d+\](\([A-Z]\))?/, ''));
            let detail = '';
            if (i + 1 < lines.length && lines[i + 1].includes('blocks')) {
                detail = lines[i + 1].trim();
            }
            arrays.push({
                name,
                state,
                level,
                devices,
                detail,
                isHealthy: state === 'active' && !line.includes('(F)')
            });
        }
    }
    return arrays;
}

function detectLinuxStorage() {
    const disks = [];
    const mounts = [];
    const raid = parseLinuxMdstat();

    try {
        const lsblkOut = execSync('lsblk -J -b -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,MODEL,SERIAL', {
            encoding: 'utf8',
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'ignore']
        });
        const parsed = JSON.parse(lsblkOut);
        const devices = parsed.blockdevices || [];

        for (const dev of devices) {
            const diskObj = {
                name: dev.name,
                model: dev.model?.trim() || null,
                serial: dev.serial?.trim() || null,
                sizeBytes: Number(dev.size) || 0,
                type: dev.type || 'disk',
                partitions: []
            };

            const children = dev.children || [dev];
            for (const child of children) {
                const mount = child.mountpoint;
                const stats = mount ? diskStats(mount) : null;
                const partObj = {
                    name: child.name,
                    fstype: child.fstype || null,
                    mountpoint: mount || null,
                    sizeBytes: Number(child.size) || 0,
                    stats
                };
                if (child !== dev) {
                    diskObj.partitions.push(partObj);
                }
                if (mount) {
                    mounts.push({
                        device: `/dev/${child.name}`,
                        mountpoint: mount,
                        fstype: child.fstype || 'unknown',
                        stats
                    });
                }
            }
            disks.push(diskObj);
        }
    } catch {
        const rootStats = diskStats('/');
        if (rootStats) {
            mounts.push({
                device: 'root',
                mountpoint: '/',
                fstype: 'unknown',
                stats: rootStats
            });
        }
    }

    try {
        const findmntOut = execSync('findmnt -J -t nfs,nfs4,cifs,smbfs', {
            encoding: 'utf8',
            timeout: 3000,
            stdio: ['pipe', 'pipe', 'ignore']
        });
        const parsed = JSON.parse(findmntOut);
        const list = parsed.filesystems || [];
        for (const net of list) {
            const stats = diskStats(net.target);
            mounts.push({
                device: net.source,
                mountpoint: net.target,
                fstype: net.fstype,
                isNetwork: true,
                stats
            });
        }
    } catch {}

    return { disks, mounts, raid };
}

function detectWindowsStorage() {
    const disks = [];
    const mounts = [];

    try {
        const psOut = execSync('powershell -NoProfile -Command "Get-Volume | Select-Object DriveLetter,FileSystemLabel,FileSystem,SizeRemaining,Size | ConvertTo-Json"', {
            encoding: 'utf8',
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'ignore']
        });
        const parsed = JSON.parse(psOut);
        const list = Array.isArray(parsed) ? parsed : [parsed];

        for (const vol of list) {
            if (!vol || !vol.DriveLetter) continue;
            const drive = `${vol.DriveLetter}:\\`;
            const stats = diskStats(drive);
            const sizeBytes = Number(vol.Size) || 0;
            const freeBytes = Number(vol.SizeRemaining) || 0;
            const usedBytes = sizeBytes - freeBytes;
            const usedPercent = sizeBytes > 0 ? Math.round((usedBytes / sizeBytes) * 1000) / 10 : 0;

            const volStats = stats || { totalBytes: sizeBytes, freeBytes, usedBytes, usedPercent };
            const mountObj = {
                device: `${vol.DriveLetter}:`,
                mountpoint: drive,
                fstype: vol.FileSystem || 'NTFS',
                label: vol.FileSystemLabel || `Disco (${vol.DriveLetter}:)`,
                stats: volStats
            };
            mounts.push(mountObj);

            disks.push({
                name: `${vol.DriveLetter}:`,
                model: vol.FileSystemLabel || `Volume ${vol.DriveLetter}:`,
                sizeBytes,
                type: 'disk',
                partitions: [
                    {
                        name: `${vol.DriveLetter}:`,
                        fstype: vol.FileSystem,
                        mountpoint: drive,
                        sizeBytes,
                        stats: volStats
                    }
                ]
            });
        }
    } catch {
        const defaultDrive = 'C:\\';
        const stats = diskStats(defaultDrive);
        if (stats) {
            mounts.push({
                device: 'C:',
                mountpoint: defaultDrive,
                fstype: 'NTFS',
                label: 'Disco di Sistema',
                stats
            });
        }
    }

    return { disks, mounts, raid: [] };
}

export function detectSystemStorage() {
    if (process.platform === 'linux') {
        return detectLinuxStorage();
    }
    if (process.platform === 'win32') {
        return detectWindowsStorage();
    }
    const rootStats = diskStats(os.homedir());
    return {
        disks: [],
        mounts: rootStats ? [{ device: 'home', mountpoint: os.homedir(), fstype: 'default', stats: rootStats }] : [],
        raid: []
    };
}

export { diskStats };
