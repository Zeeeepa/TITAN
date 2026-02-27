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

    console.log('\n' + '═'.repeat(55));
    console.log('  ⚡ TITAN installed! Launching setup wizard...');
    console.log('═'.repeat(55) + '\n');

    const result = spawnSync(process.argv[0], [cliPath, 'onboard'], {
        stdio: 'inherit',
        shell: false,
    });

    process.exit(result.status || 0);
}
