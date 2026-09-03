import test from 'node:test';
import assert from 'node:assert/strict';
import {
    base32Encode,
    base32Decode,
    generateSecret,
    deriveCode,
    verifyCode,
    otpauthUri,
    resetReplayCache
} from '../src/security/totp.js';

test('base32 codifica e decodifica correttamente i byte', () => {
    const raw = Buffer.from('12345678901234567890', 'ascii');
    const encoded = base32Encode(raw);
    assert.equal(encoded, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    const decoded = base32Decode(encoded);
    assert.deepEqual(decoded, raw);
});

test('base32 gestisce caratteri non validi e spazi', () => {
    const invalid = base32Decode('INVALID!1890');
    assert.equal(invalid.length, 0);

    const withSpaces = base32Decode('GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ');
    assert.equal(withSpaces.toString('ascii'), '12345678901234567890');
});

test('generateSecret produce segreti base32 validi da 20 byte', () => {
    const secret = generateSecret();
    assert.equal(secret.length, 32);
    const decoded = base32Decode(secret);
    assert.equal(decoded.length, 20);
});

test('vettori RFC 6238 a 6 cifre con SHA-1', () => {
    const secret = Buffer.from('12345678901234567890', 'ascii');
    const vectors = [
        { t: 59, expected: '287082' },
        { t: 1111111109, expected: '081804' },
        { t: 1111111111, expected: '050471' },
        { t: 1234567890, expected: '005924' },
        { t: 2000000000, expected: '279037' }
    ];

    for (const v of vectors) {
        const step = Math.floor(v.t / 30);
        const code = deriveCode(secret, step);
        assert.equal(code, v.expected);
    }
});

test('verifyCode accetta t, t-1 e t+1 e rifiuta t-2 e t+2', () => {
    const secret = generateSecret();
    const now = 1700000000;
    const currentStep = Math.floor(now / 30);

    const currentCode = deriveCode(secret, currentStep);
    const prevCode = deriveCode(secret, currentStep - 1);
    const nextCode = deriveCode(secret, currentStep + 1);
    const twoStepsAgo = deriveCode(secret, currentStep - 2);
    const twoStepsAhead = deriveCode(secret, currentStep + 2);

    assert.equal(verifyCode(secret, currentCode, now).valid, true);
    assert.equal(verifyCode(secret, prevCode, now).valid, true);
    assert.equal(verifyCode(secret, nextCode, now).valid, true);

    assert.equal(verifyCode(secret, twoStepsAgo, now).valid, false);
    assert.equal(verifyCode(secret, twoStepsAhead, now).valid, false);
    assert.equal(verifyCode(secret, '000000', now).valid, false);
    assert.equal(verifyCode(secret, 'abc', now).valid, false);
});

test('verifyCode rifiuta il riuso dello stesso codice entro la finestra per lo stesso utente', () => {
    resetReplayCache();
    const secret = generateSecret();
    const now = 1700000000;
    const currentStep = Math.floor(now / 30);
    const code = deriveCode(secret, currentStep);

    const firstAttempt = verifyCode(secret, code, now, 'user-1');
    assert.equal(firstAttempt.valid, true);

    const replayAttempt = verifyCode(secret, code, now, 'user-1');
    assert.equal(replayAttempt.valid, false);

    const otherUserAttempt = verifyCode(secret, code, now, 'user-2');
    assert.equal(otherUserAttempt.valid, true);
});

test('otpauthUri compone un URI valido per app di autenticazione', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const uri = otpauthUri(secret, 'admin', 'ARGUS-PR');
    assert.equal(uri, 'otpauth://totp/ARGUS-PR:admin?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=ARGUS-PR&algorithm=SHA1&digits=6&period=30');
});
