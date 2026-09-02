import { countUsers, createUser } from '../auth/auth_service.js';
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

export async function claimInstance({ username, password }) {
    assertSetupOpen();

    const admin = await createUser({
        username,
        password,
        role: Role.ADMIN,
        mustChangePassword: false
    });

    log.warn('setup completed', { username: admin.username });

    return admin;
}
