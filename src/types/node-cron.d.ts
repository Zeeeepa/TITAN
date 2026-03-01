/**
 * Minimal ambient type declarations for node-cron v3.
 * The package ships no .d.ts and @types/node-cron doesn't exist.
 */
declare module 'node-cron' {
    export interface ScheduledTask {
        start(): void;
        stop(): void;
    }

    /**
     * Schedule a task using a cron expression.
     * @param expression  Standard cron expression (5 or 6 fields).
     * @param func        Callback to invoke on each tick.
     * @param options     Optional configuration.
     */
    export function schedule(
        expression: string,
        func: () => void | Promise<void>,
        options?: { scheduled?: boolean; timezone?: string },
    ): ScheduledTask;

    /**
     * Validate a cron expression without scheduling it.
     */
    export function validate(expression: string): boolean;

    /**
     * Return all tasks managed by node-cron's internal storage.
     */
    export function getTasks(): ScheduledTask[];
}
