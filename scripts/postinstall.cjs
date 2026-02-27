#!/usr/bin/env node
'use strict';
/**
 * TITAN — Post-Install Hook
 * Automatically launches the onboarding wizard on global installs.
 * Skipped for local/dev installs (npm install inside a cloned repo).
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isGlobalInstall = process.env.npm_config_global === 'true';

if (isGlobalInstall) {
    const cliPath = path.join(__dirname, '..', 'dist', 'cli', 'index.js');

    // Safety check — if dist doesn't exist yet (e.g. running from source), skip
    if (!fs.existsSync(cliPath)) {
        console.log('\n⚡ TITAN installed! Run "titan onboard" to get started.\n');
        process.exit(0);
    }

    // Only launch the interactive wizard if we have a real TTY.
    // npm install -g runs postinstall without a TTY, which causes the
    // interactive prompt to crash immediately and fail the install.
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.log('\n' + '═'.repeat(55));
        console.log('  ⚡ TITAN installed!');
        console.log('  Run "titan onboard" to set up your AI assistant.');
        console.log('═'.repeat(55) + '\n');
        process.exit(0);
    }

    console.log('\n' + '═'.repeat(55));
    console.log('  ⚡ TITAN installed! Launching setup wizard...');
    console.log('═'.repeat(55) + '\n');

    const result = spawnSync(process.argv[0], [cliPath, 'onboard'], {
        stdio: 'inherit',
        shell: false,
    });

    // Exit 0 even if the wizard was cancelled — a cancelled wizard is not
    // a failed install. The user can always run "titan onboard" later.
    process.exit(0);
}
