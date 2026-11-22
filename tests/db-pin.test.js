const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Minimal browser globals mock for DatabaseService under Node.js
const mockStorage = new Map();
global.localStorage = {
    getItem(k) { return mockStorage.has(k) ? mockStorage.get(k) : null; },
    setItem(k, v) { mockStorage.set(k, String(v)); },
    removeItem(k) { mockStorage.delete(k); }
};
mockStorage.set('carpanga_teacher_pin', '1234'); // Legacy plaintext key should be cleaned up

global.window = {
    location: { search: '', pathname: '/', origin: 'http://localhost', hash: '' },
    history: { replaceState() {} }
};

require('../js/db.js');

const DB = global.CarpangaDB;
const { sha256Hex } = global.CarpangaDBUtils;

function runPinTests() {
    // 1. Legacy plaintext key must be wiped automatically during initialization
    assert.strictEqual(mockStorage.has('carpanga_teacher_pin'), false, 'Legacy plaintext PIN key must be purged');
    assert.strictEqual(DB.verifyTeacherPin('1234'), false, 'Old 1234 default must no longer unlock');
    assert.strictEqual(DB.verifyTeacherPin(''), false, 'Empty PIN must be rejected');

    // 2. SHA-256 pure JS parity with Node crypto across edge cases & Unicode
    const samples = [
        '',
        'abc',
        'carpanga-pin-v1:test-pin',
        'çğışöüİ-Türkçe-Şifre-2026',
        'A'.repeat(130) // multi-block > 55 bytes
    ];
    for (const s of samples) {
        const expected = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
        assert.strictEqual(sha256Hex(s), expected, `SHA-256 mismatch for "${s}"`);
    }

    // 3. Updating PIN validates length >= 4 and stores hash (never plaintext)
    assert.strictEqual(DB.setTeacherPin('123'), false, 'Short PIN (< 4 chars) must fail');
    assert.strictEqual(DB.setTeacherPin('654321'), true, 'Valid 6-char PIN must succeed');
    assert.strictEqual(DB.verifyTeacherPin('654321'), true, 'Updated PIN must verify cleanly');
    assert.strictEqual(DB.verifyTeacherPin('999999'), false, 'Wrong PIN must still fail');

    const storedVal = mockStorage.get('carpanga_teacher_pin_hash_v2') || '';
    assert.strictEqual(storedVal.length, 64, 'Stored PIN must be a 64-char SHA-256 hex digest');
    assert.strictEqual(storedVal.includes('654321'), false, 'Plaintext PIN must never be written to localStorage');

    // Resetting restores default hash without error
    DB.resetTeacherPin();
    assert.strictEqual(DB.verifyTeacherPin('654321'), false, 'Custom PIN cleared after reset');

    // 4. Verify no legacy placeholder "1234" remains in UI/JS files
    const rootDir = path.resolve(__dirname, '..');
    const filesToCheck = ['index.html', 'js/db.js', 'js/i18n.js', 'js/app.js'];
    for (const rel of filesToCheck) {
        const content = fs.readFileSync(path.join(rootDir, rel), 'utf8');
        assert.strictEqual(content.includes('1234'), false, `${rel} must not contain old "1234" PIN hints`);
    }

    console.log('ALL DB PIN LOCK & SHA-256 TESTS PASSED.');
}

runPinTests();
