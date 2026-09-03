import test from 'node:test';
import assert from 'node:assert/strict';
import { generateQrMatrix, renderQrSvg } from '../web/features/account/qr.js';

test('generateQrMatrix genera matrici quadrate corrette per lunghezze differenti', () => {
    const matrixShort = generateQrMatrix('test');
    assert.ok(matrixShort.length >= 21);
    assert.equal(matrixShort.length, matrixShort[0].length);

    const otpUri = 'otpauth://totp/ARGUS-PR:admin?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=ARGUS-PR&algorithm=SHA1&digits=6&period=30';
    const matrixOtp = generateQrMatrix(otpUri);
    assert.ok(matrixOtp.length >= 41);
    assert.equal(matrixOtp.length, matrixOtp[0].length);

    const size = matrixOtp.length;
    assert.equal(matrixOtp[0][0], 1);
    assert.equal(matrixOtp[0][size - 1], 1);
    assert.equal(matrixOtp[size - 1][0], 1);
});

test('renderQrSvg produce una stringa SVG valida con percorsi in ambiente senza DOM', () => {
    const otpUri = 'otpauth://totp/ARGUS-PR:admin?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=ARGUS-PR&algorithm=SHA1&digits=6&period=30';
    const svg = renderQrSvg(otpUri, { size: 200, className: 'test-qr' });

    assert.ok(typeof svg === 'string');
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('class="test-qr"'));
    assert.ok(svg.includes('viewBox="0 0'));
    assert.ok(svg.includes('<path d="M'));
    assert.ok(svg.endsWith('</svg>'));
});
