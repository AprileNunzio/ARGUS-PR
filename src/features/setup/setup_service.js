import { countUsers } from '../auth/auth_service.js';
import { createUser } from '../users/user_repository.js';
import { readDeviceIdentity, renameDevice } from '../system/device_identity.js';
import { Role } from '../../security/rbac.js';
import { AppError, ErrorCode } from '../../kernel/errors.js';
import { createLogger } from '../../kernel/logger.js';

const log = createLogger('setup');

export function isSetupRequired() {
    return countUsers() === 0;
}

export function prepareSetup() {
    if (!isSetupRequired()) return null;
    log.warn('setup pending');
    return { pending: true };
}

export function setupStatus() {
    return { required: isSetupRequired() };
}

export function assertSetupOpen() {
    if (!isSetupRequired()) {
        throw new AppError(ErrorCode.CONFLICT, 'This installation is already configured');
    }
}

export async function claimInstance({ username, password, profile = {}, deviceLabel = null }) {
    assertSetupOpen();

    const admin = await createUser({
        ...profile,
        username,
        password,
        role: Role.ADMIN,
        active: true,
        mustChangePassword: false
    });

    if (deviceLabel) renameDevice(deviceLabel);
    else readDeviceIdentity();

    log.warn('setup completed', { username: admin.username, completeness: admin.completeness });

    return admin;
}
