/**
 * TITAN — Auto-Update Checker
 * Checks the npm registry to see if a newer version of TITAN is available.
 * If so, displays a non-blocking notification to the user.
 */
import boxen from 'boxen';
import chalk from 'chalk';
import { TITAN_VERSION } from './constants.js';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/titan-agent/latest';

export async function getUpdateInfo(): Promise<{ current: string, latest: string | null, isNewer: boolean }> {
    try {
        const res = await fetch(NPM_REGISTRY_URL, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return { current: TITAN_VERSION, latest: null, isNewer: false };

        const data = await res.json() as { version: string };
        const latestVersion = data.version;

        if (!latestVersion) return { current: TITAN_VERSION, latest: null, isNewer: false };

        const currentParts = TITAN_VERSION.split('.').map(Number);
        const latestParts = latestVersion.split('.').map(Number);
        let isNewer = false;

        for (let i = 0; i < 3; i++) {
            if (latestParts[i] > currentParts[i]) {
                isNewer = true;
                break;
            } else if (latestParts[i] < currentParts[i]) {
                break;
            }
        }

        return { current: TITAN_VERSION, latest: latestVersion, isNewer };
    } catch {
        return { current: TITAN_VERSION, latest: null, isNewer: false };
    }
}

export async function checkForUpdates(): Promise<void> {
    const info = await getUpdateInfo();
    if (info.isNewer && info.latest) {
        const message = [
            chalk.yellow('Update available! ') + chalk.dim(TITAN_VERSION) + chalk.reset(' → ') + chalk.green(info.latest),
            chalk.reset('Run ') + chalk.cyan('npm i -g titan-agent') + chalk.reset(' to update'),
        ].join('\n');

        console.log(boxen(message, {
            padding: 1,
            margin: 1,
            align: 'center',
            borderColor: 'yellow',
            borderStyle: 'round',
        }));
    }
}
