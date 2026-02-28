import { describe, it, expect, vi } from 'vitest';
import { getUpdateInfo } from '../src/utils/updater.js';
import { TITAN_VERSION } from '../src/utils/constants.js';

describe('Updater utility', () => {
    it('getUpdateInfo should return the current version and correct boolean', async () => {
        // We aren't mocking fetch to test real functionality or graceful failure.
        const info = await getUpdateInfo();
        expect(info).toHaveProperty('current');
        expect(info.current).toBe(TITAN_VERSION);
        expect(info).toHaveProperty('latest');
        expect(info).toHaveProperty('isNewer');
        if (info.latest === null) {
            expect(info.isNewer).toBe(false);
        }
    });
});
