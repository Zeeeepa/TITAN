/**
 * TITAN — Daily Briefing
 * Every morning TITAN gives you a proactive briefing — no prompt needed.
 * This is what sets TITAN apart: TITAN doesn't wait to be asked.
 * 
 * The briefing includes:
 *  - Personalized greeting using Relationship Memory
 *  - Today's date/day summary
 *  - Active project status
 *  - Active goals reminder
 *  - Any scheduled monitors that are running
 *  - Suggested tasks based on what you've been working on
 * 
 * Automatically runs once per day when the gateway is active.
 */
import { loadProfile } from './relationship.js';
import { listMonitors } from '../agent/monitor.js';
import { listRecipes } from '../recipes/store.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TITAN_HOME } from '../utils/constants.js';
import logger from '../utils/logger.js';

const COMPONENT = 'DailyBriefing';
const BRIEFING_KEY = join(TITAN_HOME, '.last_briefing');

function hasRunToday(): boolean {
    try {
        if (!existsSync(BRIEFING_KEY)) return false;
        const last = readFileSync(BRIEFING_KEY, 'utf-8').trim();
        return new Date(last).toDateString() === new Date().toDateString();
    } catch { return false; }
}

function markRunToday(): void {
    try { writeFileSync(BRIEFING_KEY, new Date().toISOString(), 'utf-8'); } catch { /* */ }
}

/** Build the daily briefing message */
export function buildDailyBriefing(): string | null {
    const profile = loadProfile();
    const monitors = listMonitors().filter((m) => m.enabled);
    const recipes = listRecipes();

    const name = profile.name ? `, ${profile.name}` : '';
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const dayName = days[now.getDay()];
    const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const sections: string[] = [];

    // Greeting
    const hour = now.getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    sections.push(`${timeGreeting}${name}! It's ${dayName}, ${dateStr}.`);

    // Active projects
    const activeProjects = profile.projects.slice(0, 3);
    if (activeProjects.length > 0) {
        sections.push(`📁 **Your active projects:** ${activeProjects.map((p) => p.name).join(', ')}`);
    }

    // Current goals
    const pendingGoals = profile.goals.filter((g) => !g.completed).slice(0, 3);
    if (pendingGoals.length > 0) {
        sections.push(`🎯 **Goals in progress:** ${pendingGoals.map((g) => g.goal).join(' · ')}`);
    }

    // Active monitors
    if (monitors.length > 0) {
        sections.push(`👁️ **Watching for you:** ${monitors.map((m) => m.name).join(', ')} (${monitors.length} active monitor${monitors.length !== 1 ? 's' : ''})`);
    }

    // Quick commands reminder
    if (recipes.length > 0) {
        const slashCmds = recipes.filter((r) => r.slashCommand).map((r) => `/${r.slashCommand}`).slice(0, 4);
        if (slashCmds.length > 0) {
            sections.push(`⚡ **Quick commands:** ${slashCmds.join(' · ')} — just type them in chat anytime`);
        }
    }

    // Encouragement for beginners
    if (profile.technicalLevel === 'beginner' || profile.technicalLevel === 'unknown') {
        sections.push(`💡 **Tip:** You can ask me anything in plain English — no technical knowledge needed. Just talk to me like you'd talk to a friend!`);
    }

    sections.push(`\nWhat would you like to work on today? I'm ready when you are.`);

    return sections.join('\n\n');
}

/** Check and send a daily briefing if not already sent today */
export async function checkAndSendBriefing(
    sender: (msg: string) => Promise<void>
): Promise<void> {
    if (hasRunToday()) return;

    // Only send in the morning window (6am–11am) or if first boot of the day
    const hour = new Date().getHours();
    if (hour < 6 || hour >= 12) return;

    const briefing = buildDailyBriefing();
    if (!briefing) return;

    try {
        await sender(briefing);
        markRunToday();
        logger.info(COMPONENT, 'Daily briefing sent');
    } catch (e) {
        logger.warn(COMPONENT, `Could not send daily briefing: ${(e as Error).message}`);
    }
}
