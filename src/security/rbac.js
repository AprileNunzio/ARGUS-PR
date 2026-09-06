export const Permission = Object.freeze({
    LIVE_VIEW: 'live.view',
    ARCHIVE_VIEW: 'archive.view',
    ARCHIVE_EXPORT: 'archive.export',
    CAMERA_MANAGE: 'camera.manage',
    STORAGE_MANAGE: 'storage.manage',
    ALARM_ACKNOWLEDGE: 'alarm.acknowledge',
    ALARM_MANAGE: 'alarm.manage',
    USER_MANAGE: 'user.manage',
    SYSTEM_MANAGE: 'system.manage',
    AUDIT_VIEW: 'audit.view'
});

export const Role = Object.freeze({
    ADMIN: 'admin',
    OPERATOR: 'operator',
    VIEWER: 'viewer'
});

const GRANTS = Object.freeze({
    admin: Object.values(Permission),
    operator: [
        Permission.LIVE_VIEW,
        Permission.ARCHIVE_VIEW,
        Permission.ARCHIVE_EXPORT,
        Permission.ALARM_ACKNOWLEDGE
    ],
    viewer: [
        Permission.LIVE_VIEW,
        Permission.ARCHIVE_VIEW
    ]
});

export function permissionsFor(role) {
    return GRANTS[role] ?? [];
}

export function roleExists(role) {
    return Object.prototype.hasOwnProperty.call(GRANTS, role);
}

export function can(role, permission) {
    return permissionsFor(role).includes(permission);
}
