/**
 * TITAN — Recipe Types
 * Recipes are reusable, shareable AI workflows — like saved conversations
 * with pre-defined steps, parameters, and goals. Think of them as your
 * personal JARVIS playbooks.
 */

/** A single step in a recipe */
export interface RecipeStep {
    /** Natural language prompt — supports {{parameter}} interpolation */
    prompt: string;
    /** Optional: specific tool to call directly (skips LLM for that step) */
    tool?: string;
    toolArgs?: Record<string, unknown>;
    /** Wait for user confirmation before proceeding */
    awaitConfirm?: boolean;
}

/** A full Recipe definition */
export interface Recipe {
    /** Unique ID, used for the slash command */
    id: string;
    /** Display name */
    name: string;
    /** What this recipe does */
    description: string;
    /** Slash command shortcut, e.g. "code-review" → /code-review */
    slashCommand?: string;
    /** Named parameters the user can provide */
    parameters?: Record<string, {
        description: string;
        required: boolean;
        default?: string;
    }>;
    /** The ordered steps TITAN will execute */
    steps: RecipeStep[];
    /** Author credit */
    author?: string;
    /** Tags for searching */
    tags?: string[];
    /** When this recipe was created */
    createdAt: string;
    /** When this recipe was last run */
    lastRunAt?: string;
}
