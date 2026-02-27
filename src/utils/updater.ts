/**
 * TITAN — Auto-Update Checker
 * Checks the npm registry to see if a newer version of TITAN is available.
 * If so, displays a non-blocking notification to the user.
 */
import boxen from 'boxen';
import chalk from 'chalk';
import { TITAN_VERSION } from './constants.js';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/titan-agent/latest';

export async function checkForUpdates(): Promise<void> {
    try {
        // Fast timeout so we don't block CLI startup if offline
        const res = await fetch(NPM_REGISTRY_URL, {
            signal: AbortSignal.timeout(2000),
        });

        if (!res.ok) return;

        const data = await res.json() as { version: string };
        const latestVersion = data.version;

        if (latestVersion && latestVersion !== TITAN_VERSION) {
            // Simple comparison (assuming CalVer YYYY.M.D always increments)
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

            if (isNewer) {
                const message = [
                    chalk.yellow('Update available! ') + chalk.dim(TITAN_VERSION) + chalk.reset(' → ') + chalk.green(latestVersion),
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
    } catch {
        // Silently ignore errors (offline, registry down, timeout)
    }
}
