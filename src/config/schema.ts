/**
 * TITAN Configuration Schema — Zod-based validation with full type inference
 */
import { z } from 'zod';
import {
    DEFAULT_GATEWAY_HOST,
    DEFAULT_GATEWAY_PORT,
    DEFAULT_WEB_PORT,
    DEFAULT_MODEL,
    DEFAULT_MAX_TOKENS,
    DEFAULT_TEMPERATURE,
    DEFAULT_SANDBOX_MODE,
    ALLOWED_TOOLS_DEFAULT,
} from '../utils/constants.js';

export const ProviderConfigSchema = z.object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    model: z.string().optional(),
    maxTokens: z.number().optional(),
    temperature: z.number().min(0).max(2).optional(),
});

export const ChannelConfigSchema = z.object({
    enabled: z.boolean().default(false),
    token: z.string().optional(),
    apiKey: z.string().optional(),
    allowFrom: z.array(z.string()).default([]),
    dmPolicy: z.enum(['pairing', 'open', 'closed']).default('pairing'),
});

export const SecurityConfigSchema = z.object({
    sandboxMode: z.enum(['host', 'docker', 'none']).default(DEFAULT_SANDBOX_MODE as 'host'),
    allowedTools: z.array(z.string()).default(ALLOWED_TOOLS_DEFAULT),
    deniedTools: z.array(z.string()).default([]),
    maxConcurrentTasks: z.number().default(5),
    commandTimeout: z.number().default(30000),
    fileSystemAllowlist: z.array(z.string()).default([]),
    networkAllowlist: z.array(z.string()).default(['*']),
    shield: z.object({
        enabled: z.boolean().default(true),
        mode: z.enum(['standard', 'strict']).default('strict'),
    }).default({}),
});

export const GatewayConfigSchema = z.object({
    host: z.string().default(DEFAULT_GATEWAY_HOST),
    port: z.number().default(DEFAULT_GATEWAY_PORT),
    webPort: z.number().default(DEFAULT_WEB_PORT),
    auth: z.object({
        mode: z.enum(['none', 'token', 'password']).default('token'),
        token: z.string().optional(),
        password: z.string().optional(),
    }).default({}),
});

export const AgentConfigSchema = z.object({
    model: z.string().default(DEFAULT_MODEL),
    maxTokens: z.number().default(DEFAULT_MAX_TOKENS),
    temperature: z.number().min(0).max(2).default(DEFAULT_TEMPERATURE),
    systemPrompt: z.string().optional(),
    workspace: z.string().optional(),
    thinkingMode: z.enum(['off', 'low', 'medium', 'high']).default('medium'),
    /** Model aliases — e.g. { fast: "openai/gpt-4o-mini", smart: "anthropic/claude-sonnet-4-20250514", local: "ollama/llama3.1" } */
    modelAliases: z.record(z.string(), z.string()).default({
        fast: 'openai/gpt-4o-mini',
        smart: 'anthropic/claude-sonnet-4-20250514',
        reasoning: 'openai/o3-mini',
        cheap: 'google/gemini-2.0-flash',
    }),
    costOptimization: z.object({
        smartRouting: z.boolean().default(true),
        contextSummarization: z.boolean().default(true),
        dailyBudgetUsd: z.number().optional(),
    }).optional(),
});

export const MeshConfigSchema = z.object({
    enabled: z.boolean().default(false),
    secret: z.string().optional(),
    /** Auto-discover peers via mDNS (Bonjour) on the local network */
    mdns: z.boolean().default(true),
    /** Auto-discover peers via Tailscale VPN */
    tailscale: z.boolean().default(true),
    /** Manually specified peer addresses (host:port) */
    staticPeers: z.array(z.string()).default([]),
    /** Allow remote nodes to use this node's models */
    allowRemoteModels: z.boolean().default(true),
    /** Maximum concurrent remote tasks */
    maxRemoteTasks: z.number().default(3),
});

export const TitanConfigSchema = z.object({
    agent: AgentConfigSchema.default({}),
    providers: z.object({
        anthropic: ProviderConfigSchema.default({}),
        openai: ProviderConfigSchema.default({}),
        google: ProviderConfigSchema.default({}),
        ollama: ProviderConfigSchema.default({}),
        // OpenAI-compatible providers
        groq: ProviderConfigSchema.default({}),
        mistral: ProviderConfigSchema.default({}),
        openrouter: ProviderConfigSchema.default({}),
        fireworks: ProviderConfigSchema.default({}),
        xai: ProviderConfigSchema.default({}),
        together: ProviderConfigSchema.default({}),
        deepseek: ProviderConfigSchema.default({}),
        cerebras: ProviderConfigSchema.default({}),
        cohere: ProviderConfigSchema.default({}),
        perplexity: ProviderConfigSchema.default({}),
    }).default({}),
    channels: z.object({
        discord: ChannelConfigSchema.default({}),
        telegram: ChannelConfigSchema.default({}),
        slack: ChannelConfigSchema.default({}),
        whatsapp: ChannelConfigSchema.default({}),
        webchat: ChannelConfigSchema.default({}),
        googlechat: ChannelConfigSchema.default({}),
        matrix: ChannelConfigSchema.default({}),
        signal: ChannelConfigSchema.default({}),
        msteams: ChannelConfigSchema.default({}),
        bluebubbles: ChannelConfigSchema.default({}),
    }).default({}),
    gateway: GatewayConfigSchema.default({}),
    security: SecurityConfigSchema.default({}),
    memory: z.object({
        enabled: z.boolean().default(true),
        maxHistoryMessages: z.number().default(50),
        vectorSearchEnabled: z.boolean().default(false),
    }).default({}),
    skills: z.object({
        enabled: z.boolean().default(true),
        autoDiscover: z.boolean().default(true),
        marketplace: z.boolean().default(false),
    }).default({}),
    mesh: MeshConfigSchema.default({}),
    logging: z.object({
        level: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
        file: z.boolean().default(true),
    }).default({}),
    autonomy: z.object({
        /** autonomous = full auto, supervised = asks for dangerous ops, locked = asks for everything */
        mode: z.enum(['autonomous', 'supervised', 'locked']).default('supervised'),
        /** Auto-approve moderate-risk tools in main session (cli/webchat) */
        autoApproveMainSession: z.boolean().default(true),
        /** Timeout for HITL approval requests (ms). Auto-deny after timeout. */
        approvalTimeoutMs: z.number().default(60000),
        /** Notify user of auto-approved actions */
        notifyOnAutoApprove: z.boolean().default(true),
    }).default({}),
});

export type TitanConfig = z.infer<typeof TitanConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type MeshConfig = z.infer<typeof MeshConfigSchema>;
