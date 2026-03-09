/**
 * TITAN — Team Mode with Role-Based Access Control (RBAC)
 * Multi-user support with roles, per-team tool permissions, and audit trails.
 *
 * Roles (hierarchical):
 *   owner  — full control, can delete team, manage roles
 *   admin  — manage members, configure team settings, all tools
 *   operator — use all permitted tools, create sessions
 *   viewer — read-only access, can view sessions and history
 */
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { TITAN_HOME } from '../utils/constants.js';
import logger from '../utils/logger.js';

const COMPONENT = 'Teams';

// ─── Types ───────────────────────────────────────────────────

export type TeamRole = 'owner' | 'admin' | 'operator' | 'viewer';
export type MemberStatus = 'pending' | 'active' | 'suspended' | 'revoked';

export interface TeamMember {
    userId: string;
    role: TeamRole;
    status: MemberStatus;
    joinedAt: string;
    invitedBy: string;
    /** Optional display name */
    displayName?: string;
    /** Last activity timestamp */
    lastActive?: string;
}

export interface RolePermissions {
    /** Tool name patterns (supports wildcards: 'shell', 'web_*', '*') */
    allowedTools: string[];
    /** Explicitly denied tools (overrides allowed) */
    deniedTools: string[];
    /** Can manage team members */
    canManageMembers: boolean;
    /** Can modify team settings */
    canManageSettings: boolean;
    /** Can spawn/stop agents */
    canManageAgents: boolean;
    /** Can view audit log */
    canViewAudit: boolean;
    /** Can use the API (send messages) */
    canUseApi: boolean;
    /** Max concurrent sessions */
    maxSessions: number;
}

export interface Team {
    id: string;
    name: string;
    description?: string;
    ownerId: string;
    members: TeamMember[];
    /** Per-role permission overrides (defaults applied if not specified) */
    rolePermissions: Partial<Record<TeamRole, Partial<RolePermissions>>>;
    createdAt: string;
    updatedAt: string;
}

export interface TeamsStore {
    teams: Team[];
    /** Invite codes: code → { teamId, role, expiresAt, createdBy } */
    invites: Record<string, { teamId: string; role: TeamRole; expiresAt: string; createdBy: string }>;
}

// ─── Default Role Permissions ────────────────────────────────

const DEFAULT_PERMISSIONS: Record<TeamRole, RolePermissions> = {
    owner: {
        allowedTools: ['*'],
        deniedTools: [],
        canManageMembers: true,
        canManageSettings: true,
        canManageAgents: true,
        canViewAudit: true,
        canUseApi: true,
        maxSessions: 50,
    },
    admin: {
        allowedTools: ['*'],
        deniedTools: [],
        canManageMembers: true,
        canManageSettings: true,
        canManageAgents: true,
        canViewAudit: true,
        canUseApi: true,
        maxSessions: 25,
    },
    operator: {
        allowedTools: ['*'],
        deniedTools: [],
        canManageMembers: false,
        canManageSettings: false,
        canManageAgents: true,
        canViewAudit: false,
        canUseApi: true,
        maxSessions: 10,
    },
    viewer: {
        allowedTools: [],
        deniedTools: ['*'],
        canManageMembers: false,
        canManageSettings: false,
        canManageAgents: false,
        canViewAudit: true,
        canUseApi: false,
        maxSessions: 1,
    },
};

// ─── Persistence ─────────────────────────────────────────────

const TEAMS_FILE = join(TITAN_HOME, 'teams.json');

let store: TeamsStore | null = null;

function loadStore(): TeamsStore {
    if (store) return store;
    try {
        if (existsSync(TEAMS_FILE)) {
            store = JSON.parse(readFileSync(TEAMS_FILE, 'utf-8'));
            return store!;
        }
    } catch (err) {
        logger.warn(COMPONENT, `Failed to load teams store: ${(err as Error).message}`);
    }
    store = { teams: [], invites: {} };
    return store;
}

function saveStore(): void {
    const s = loadStore();
    try {
        const dir = dirname(TEAMS_FILE);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(TEAMS_FILE, JSON.stringify(s, null, 2), 'utf-8');
    } catch (err) {
        logger.error(COMPONENT, `Failed to save teams store: ${(err as Error).message}`);
    }
}

/** Reset store cache (for testing) */
export function resetTeamsCache(): void {
    store = null;
}

// ─── Team CRUD ───────────────────────────────────────────────

export function createTeam(name: string, ownerId: string, description?: string): Team {
    const s = loadStore();
    if (s.teams.find(t => t.name === name)) {
        throw new Error(`Team "${name}" already exists`);
    }

    const team: Team = {
        id: randomBytes(12).toString('hex'),
        name,
        description,
        ownerId,
        members: [{
            userId: ownerId,
            role: 'owner',
            status: 'active',
            joinedAt: new Date().toISOString(),
            invitedBy: ownerId,
        }],
        rolePermissions: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    s.teams.push(team);
    saveStore();
    logger.info(COMPONENT, `Team "${name}" created by ${ownerId}`);
    return team;
}

export function getTeam(teamId: string): Team | undefined {
    return loadStore().teams.find(t => t.id === teamId);
}

export function getTeamByName(name: string): Team | undefined {
    return loadStore().teams.find(t => t.name === name);
}

export function listTeams(): Team[] {
    return loadStore().teams;
}

export function listUserTeams(userId: string): Team[] {
    return loadStore().teams.filter(t =>
        t.members.some(m => m.userId === userId && m.status === 'active')
    );
}

export function deleteTeam(teamId: string, actorId: string): boolean {
    const s = loadStore();
    const team = s.teams.find(t => t.id === teamId);
    if (!team) return false;
    if (team.ownerId !== actorId) throw new Error('Only the team owner can delete a team');

    s.teams = s.teams.filter(t => t.id !== teamId);
    // Clean up invites for this team
    for (const [code, invite] of Object.entries(s.invites)) {
        if (invite.teamId === teamId) delete s.invites[code];
    }
    saveStore();
    logger.info(COMPONENT, `Team "${team.name}" deleted by ${actorId}`);
    return true;
}

export function updateTeam(teamId: string, actorId: string, updates: { name?: string; description?: string }): Team {
    const team = getTeam(teamId);
    if (!team) throw new Error('Team not found');
    const perms = getEffectivePermissions(teamId, actorId);
    if (!perms.canManageSettings) throw new Error('Insufficient permissions');

    if (updates.name) team.name = updates.name;
    if (updates.description !== undefined) team.description = updates.description;
    team.updatedAt = new Date().toISOString();
    saveStore();
    return team;
}

// ─── Member Management ───────────────────────────────────────

export function createInvite(teamId: string, actorId: string, role: TeamRole = 'operator', expiresInHours: number = 48): string {
    const team = getTeam(teamId);
    if (!team) throw new Error('Team not found');
    const actorPerms = getEffectivePermissions(teamId, actorId);
    if (!actorPerms.canManageMembers) throw new Error('Insufficient permissions');

    // Cannot invite higher role than your own
    const actorMember = team.members.find(m => m.userId === actorId);
    if (actorMember && ROLE_HIERARCHY[role] > ROLE_HIERARCHY[actorMember.role]) {
        throw new Error('Cannot invite a role higher than your own');
    }

    const code = randomBytes(16).toString('hex');
    const s = loadStore();
    s.invites[code] = {
        teamId,
        role,
        expiresAt: new Date(Date.now() + expiresInHours * 3600000).toISOString(),
        createdBy: actorId,
    };
    saveStore();
    logger.info(COMPONENT, `Invite created for team "${team.name}" (role: ${role}) by ${actorId}`);
    return code;
}

export function acceptInvite(code: string, userId: string, displayName?: string): { team: Team; member: TeamMember } {
    const s = loadStore();
    const invite = s.invites[code];
    if (!invite) throw new Error('Invalid invite code');
    if (new Date(invite.expiresAt) < new Date()) {
        delete s.invites[code];
        saveStore();
        throw new Error('Invite has expired');
    }

    const team = s.teams.find(t => t.id === invite.teamId);
    if (!team) throw new Error('Team no longer exists');

    // Check if already a member
    const existing = team.members.find(m => m.userId === userId);
    if (existing && existing.status === 'active') {
        throw new Error('Already a member of this team');
    }

    const member: TeamMember = {
        userId,
        role: invite.role,
        status: 'active',
        joinedAt: new Date().toISOString(),
        invitedBy: invite.createdBy,
        displayName,
    };

    if (existing) {
        // Reactivate revoked/suspended member
        Object.assign(existing, member);
    } else {
        team.members.push(member);
    }

    team.updatedAt = new Date().toISOString();
    delete s.invites[code];
    saveStore();
    logger.info(COMPONENT, `${userId} joined team "${team.name}" as ${invite.role}`);
    return { team, member };
}

export function addMember(teamId: string, actorId: string, userId: string, role: TeamRole = 'operator', displayName?: string): TeamMember {
    const team = getTeam(teamId);
    if (!team) throw new Error('Team not found');
    const actorPerms = getEffectivePermissions(teamId, actorId);
    if (!actorPerms.canManageMembers) throw new Error('Insufficient permissions');

    const actorMember = team.members.find(m => m.userId === actorId);
    if (actorMember && ROLE_HIERARCHY[role] > ROLE_HIERARCHY[actorMember.role]) {
        throw new Error('Cannot assign a role higher than your own');
    }

    const existing = team.members.find(m => m.userId === userId);
    if (existing && existing.status === 'active') {
        throw new Error('User is already an active member');
    }

    const member: TeamMember = {
        userId,
        role,
        status: 'active',
        joinedAt: new Date().toISOString(),
        invitedBy: actorId,
        displayName,
    };

    if (existing) {
        Object.assign(existing, member);
    } else {
        team.members.push(member);
    }

    team.updatedAt = new Date().toISOString();
    saveStore();
    logger.info(COMPONENT, `${userId} added to team "${team.name}" as ${role} by ${actorId}`);
    return member;
}

export function removeMember(teamId: string, actorId: string, userId: string): boolean {
    const team = getTeam(teamId);
    if (!team) throw new Error('Team not found');
    if (userId === team.ownerId) throw new Error('Cannot remove the team owner');

    const actorPerms = getEffectivePermissions(teamId, actorId);
    if (!actorPerms.canManageMembers && actorId !== userId) {
        throw new Error('Insufficient permissions');
    }

    const member = team.members.find(m => m.userId === userId);
    if (!member) return false;

    member.status = 'revoked';
    team.updatedAt = new Date().toISOString();
    saveStore();
    logger.info(COMPONENT, `${userId} removed from team "${team.name}" by ${actorId}`);
    return true;
}

export function updateMemberRole(teamId: string, actorId: string, userId: string, newRole: TeamRole): TeamMember {
    const team = getTeam(teamId);
    if (!team) throw new Error('Team not found');
    const actorPerms = getEffectivePermissions(teamId, actorId);
    if (!actorPerms.canManageMembers) throw new Error('Insufficient permissions');

    const actorMember = team.members.find(m => m.userId === actorId);
    if (actorMember && ROLE_HIERARCHY[newRole] > ROLE_HIERARCHY[actorMember.role]) {
        throw new Error('Cannot assign a role higher than your own');
    }

    const member = team.members.find(m => m.userId === userId && m.status === 'active');
    if (!member) throw new Error('Active member not found');
    if (member.role === 'owner') throw new Error('Cannot change the owner role');

    member.role = newRole;
    team.updatedAt = new Date().toISOString();
    saveStore();
    logger.info(COMPONENT, `${userId} role changed to ${newRole} in team "${team.name}" by ${actorId}`);
    return member;
}

// ─── RBAC Engine ─────────────────────────────────────────────

const ROLE_HIERARCHY: Record<TeamRole, number> = {
    viewer: 0,
    operator: 1,
    admin: 2,
    owner: 3,
};

/** Get effective permissions for a user in a team */
export function getEffectivePermissions(teamId: string, userId: string): RolePermissions {
    const team = getTeam(teamId);
    if (!team) return DEFAULT_PERMISSIONS.viewer;

    const member = team.members.find(m => m.userId === userId && m.status === 'active');
    if (!member) return DEFAULT_PERMISSIONS.viewer;

    const base = { ...DEFAULT_PERMISSIONS[member.role] };
    const overrides = team.rolePermissions[member.role];

    if (overrides) {
        if (overrides.allowedTools) base.allowedTools = overrides.allowedTools;
        if (overrides.deniedTools) base.deniedTools = overrides.deniedTools;
        if (overrides.canManageMembers !== undefined) base.canManageMembers = overrides.canManageMembers;
        if (overrides.canManageSettings !== undefined) base.canManageSettings = overrides.canManageSettings;
        if (overrides.canManageAgents !== undefined) base.canManageAgents = overrides.canManageAgents;
        if (overrides.canViewAudit !== undefined) base.canViewAudit = overrides.canViewAudit;
        if (overrides.canUseApi !== undefined) base.canUseApi = overrides.canUseApi;
        if (overrides.maxSessions !== undefined) base.maxSessions = overrides.maxSessions;
    }

    return base;
}

/** Check if a user has permission to use a specific tool in a team */
export function isToolAllowed(teamId: string, userId: string, toolName: string): boolean {
    const perms = getEffectivePermissions(teamId, userId);

    // Check denied first (deny overrides allow)
    for (const pattern of perms.deniedTools) {
        if (matchesPattern(toolName, pattern)) return false;
    }

    // Check allowed
    for (const pattern of perms.allowedTools) {
        if (matchesPattern(toolName, pattern)) return true;
    }

    return false;
}

/** Check if a user's role is at least the specified minimum */
export function hasMinimumRole(teamId: string, userId: string, minRole: TeamRole): boolean {
    const team = getTeam(teamId);
    if (!team) return false;

    const member = team.members.find(m => m.userId === userId && m.status === 'active');
    if (!member) return false;

    return ROLE_HIERARCHY[member.role] >= ROLE_HIERARCHY[minRole];
}

/** Get a user's role in a team (or null if not a member) */
export function getUserRole(teamId: string, userId: string): TeamRole | null {
    const team = getTeam(teamId);
    if (!team) return null;

    const member = team.members.find(m => m.userId === userId && m.status === 'active');
    return member?.role ?? null;
}

/** Update per-role permissions for a team */
export function setRolePermissions(teamId: string, actorId: string, role: TeamRole, perms: Partial<RolePermissions>): void {
    const team = getTeam(teamId);
    if (!team) throw new Error('Team not found');
    if (!hasMinimumRole(teamId, actorId, 'admin')) throw new Error('Insufficient permissions');
    if (role === 'owner') throw new Error('Cannot override owner permissions');

    team.rolePermissions[role] = { ...team.rolePermissions[role], ...perms };
    team.updatedAt = new Date().toISOString();
    saveStore();
    logger.info(COMPONENT, `Role "${role}" permissions updated in team "${team.name}" by ${actorId}`);
}

// ─── Helpers ─────────────────────────────────────────────────

/** Match a tool name against a glob pattern (supports * wildcard) */
function matchesPattern(name: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
        return name.startsWith(pattern.slice(0, -1));
    }
    return name === pattern;
}

/** Get team stats summary */
export function getTeamStats(teamId: string): { memberCount: number; activeCount: number; roleBreakdown: Record<TeamRole, number> } | null {
    const team = getTeam(teamId);
    if (!team) return null;

    const active = team.members.filter(m => m.status === 'active');
    const roleBreakdown: Record<TeamRole, number> = { owner: 0, admin: 0, operator: 0, viewer: 0 };
    for (const m of active) roleBreakdown[m.role]++;

    return { memberCount: team.members.length, activeCount: active.length, roleBreakdown };
}
