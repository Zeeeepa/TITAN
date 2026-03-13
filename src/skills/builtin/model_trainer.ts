/**
 * TITAN — Model Trainer Skill (Built-in)
 * Fine-tunes local Ollama models on TITAN's own conversation history
 * using the GPU (RTX 5090) on Titan PC.
 *
 * Pipeline: prepare training data → launch LoRA fine-tune → poll progress → deploy to Ollama
 */
import { registerSkill } from '../registry.js';
import { loadConfig } from '../../config/config.js';
import logger from '../../utils/logger.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { TITAN_HOME, TITAN_DB_PATH } from '../../utils/constants.js';
import { execSync } from 'child_process';

const COMPONENT = 'ModelTrainer';

// ── Paths ────────────────────────────────────────────────────────────
const TRAINING_DIR = join(TITAN_HOME, 'training-data');
const TRAINING_RUNS_DIR = join(TITAN_HOME, 'training-runs');
const TRAINING_HISTORY_PATH = join(TITAN_HOME, 'training-history.jsonl');

// ── Types ────────────────────────────────────────────────────────────

interface TrainingRun {
    id: string;
    status: 'preparing' | 'training' | 'completed' | 'failed' | 'deploying';
    startedAt: string;
    completedAt?: string;
    baseModel: string;
    method: string;
    dataPoints: number;
    epochs?: number;
    finalLoss?: number;
    outputModel?: string;
    error?: string;
}

interface TrainingDataPoint {
    instruction: string;
    response: string;
    toolsUsed?: string[];
    score?: number;
}

// ── Active training tracking ─────────────────────────────────────────
const activeRuns: Map<string, TrainingRun> = new Map();

// ── Helpers ──────────────────────────────────────────────────────────

function ensureDirs(): void {
    for (const dir of [TRAINING_DIR, TRAINING_RUNS_DIR]) {
        mkdirSync(dir, { recursive: true });
    }
}

function getRunId(): string {
    return `train-${Date.now().toString(36)}`;
}

function appendTrainingHistory(run: TrainingRun): void {
    ensureDirs();
    appendFileSync(TRAINING_HISTORY_PATH, JSON.stringify(run) + '\n', 'utf-8');
}

function readTrainingHistory(limit: number = 20): TrainingRun[] {
    if (!existsSync(TRAINING_HISTORY_PATH)) return [];
    try {
        const lines = readFileSync(TRAINING_HISTORY_PATH, 'utf-8').split('\n').filter(l => l.trim());
        const runs = lines.map(l => {
            try { return JSON.parse(l) as TrainingRun; }
            catch { return null; }
        }).filter(Boolean) as TrainingRun[];
        return runs.slice(-limit);
    } catch {
        return [];
    }
}

/** Extract high-quality training pairs from TITAN's session database */
function extractTrainingData(): TrainingDataPoint[] {
    const dataPoints: TrainingDataPoint[] = [];

    // Try to read from session history files
    const sessionsDir = join(TITAN_HOME, 'sessions');
    if (!existsSync(sessionsDir)) {
        logger.warn(COMPONENT, 'No sessions directory found');
        return dataPoints;
    }

    try {
        const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
        for (const file of files.slice(-100)) { // Last 100 sessions
            try {
                const sessionData = JSON.parse(readFileSync(join(sessionsDir, file), 'utf-8'));
                const messages = sessionData.messages || sessionData.history || [];

                for (let i = 0; i < messages.length - 1; i++) {
                    const msg = messages[i];
                    const nextMsg = messages[i + 1];

                    if (msg.role === 'user' && nextMsg.role === 'assistant' && nextMsg.content) {
                        // Only include substantive exchanges
                        if (msg.content.length > 10 && nextMsg.content.length > 20) {
                            dataPoints.push({
                                instruction: msg.content,
                                response: nextMsg.content,
                                toolsUsed: nextMsg.toolsUsed || [],
                            });
                        }
                    }
                }
            } catch {
                // Skip corrupt session files
            }
        }
    } catch (e) {
        logger.warn(COMPONENT, `Error reading sessions: ${(e as Error).message}`);
    }

    // Also read from learning data for quality signals
    const learningPath = join(TITAN_HOME, 'learning.json');
    if (existsSync(learningPath)) {
        try {
            const learning = JSON.parse(readFileSync(learningPath, 'utf-8'));
            // Use tool success rates to score training data quality
            if (learning.toolSuccessRates) {
                // Boost data points that used successful tools
                for (const dp of dataPoints) {
                    if (dp.toolsUsed && dp.toolsUsed.length > 0) {
                        const avgRate = dp.toolsUsed.reduce((sum: number, tool: string) => {
                            const rate = learning.toolSuccessRates[tool];
                            return sum + (rate?.successRate || 0.5);
                        }, 0) / dp.toolsUsed.length;
                        dp.score = avgRate;
                    }
                }
            }
        } catch {
            // Ignore learning data errors
        }
    }

    // Sort by quality score (higher is better) and filter
    return dataPoints
        .sort((a, b) => (b.score || 0.5) - (a.score || 0.5))
        .filter(dp => (dp.score || 0.5) >= 0.4); // Exclude low-quality pairs
}

// ── Tool implementations ─────────────────────────────────────────────

async function trainPrepare(args: Record<string, unknown>): Promise<string> {
    const minSamples = (args.minSamples as number) || 50;

    ensureDirs();

    logger.info(COMPONENT, 'Extracting training data from session history...');
    const dataPoints = extractTrainingData();

    if (dataPoints.length < minSamples) {
        return `Not enough high-quality training data. Found ${dataPoints.length} pairs, need at least ${minSamples}. Keep using TITAN to build up more conversation history.`;
    }

    // Format as JSONL for training
    const jsonlPath = join(TRAINING_DIR, 'train.jsonl');
    const jsonlContent = dataPoints.map(dp => JSON.stringify({
        messages: [
            { role: 'user', content: dp.instruction },
            { role: 'assistant', content: dp.response },
        ],
    })).join('\n');

    writeFileSync(jsonlPath, jsonlContent, 'utf-8');

    // Create a validation split (10%)
    const valSize = Math.max(1, Math.floor(dataPoints.length * 0.1));
    const valData = dataPoints.slice(0, valSize);
    const valPath = join(TRAINING_DIR, 'val.jsonl');
    writeFileSync(valPath, valData.map(dp => JSON.stringify({
        messages: [
            { role: 'user', content: dp.instruction },
            { role: 'assistant', content: dp.response },
        ],
    })).join('\n'), 'utf-8');

    return [
        `## Training Data Prepared`,
        ``,
        `| Stat | Value |`,
        `|------|-------|`,
        `| Total pairs | ${dataPoints.length} |`,
        `| Training set | ${dataPoints.length - valSize} |`,
        `| Validation set | ${valSize} |`,
        `| Avg quality score | ${(dataPoints.reduce((s, d) => s + (d.score || 0.5), 0) / dataPoints.length).toFixed(2)} |`,
        ``,
        `Training data: \`${jsonlPath}\``,
        `Validation data: \`${valPath}\``,
        ``,
        `Ready to train. Use \`train_start\` to begin fine-tuning.`,
    ].join('\n');
}

async function trainStart(args: Record<string, unknown>): Promise<string> {
    const config = loadConfig();
    const trainingConfig = (config as Record<string, unknown>).training as Record<string, unknown> | undefined;

    if (trainingConfig && trainingConfig.enabled === false) {
        return 'Training is disabled in config. Set training.enabled = true to enable.';
    }

    const baseModel = (args.baseModel as string) || (trainingConfig?.baseModel as string) || 'qwen3.5:35b';
    const method = (args.method as string) || (trainingConfig?.method as string) || 'lora';
    const budgetMinutes = (args.budgetMinutes as number) || (trainingConfig?.budgetMinutes as number) || 30;
    const epochs = (args.epochs as number) || 3;

    const trainDataPath = join(TRAINING_DIR, 'train.jsonl');
    if (!existsSync(trainDataPath)) {
        return 'No training data found. Run `train_prepare` first.';
    }

    const dataLines = readFileSync(trainDataPath, 'utf-8').split('\n').filter(l => l.trim());
    if (dataLines.length < 10) {
        return `Only ${dataLines.length} training samples — need at least 10. Run \`train_prepare\` to extract more data.`;
    }

    const runId = getRunId();
    const runDir = join(TRAINING_RUNS_DIR, runId);
    mkdirSync(runDir, { recursive: true });

    const run: TrainingRun = {
        id: runId,
        status: 'training',
        startedAt: new Date().toISOString(),
        baseModel,
        method,
        dataPoints: dataLines.length,
        epochs,
    };
    activeRuns.set(runId, run);

    // Generate training script
    const trainScript = `#!/usr/bin/env python3
"""TITAN Auto-Training Script — LoRA fine-tuning via unsloth"""
import os, sys, json, time

# Check if unsloth is available
try:
    from unsloth import FastLanguageModel
    from trl import SFTTrainer
    from transformers import TrainingArguments
    from datasets import load_dataset
    HAS_UNSLOTH = True
except ImportError:
    HAS_UNSLOTH = False
    print("WARNING: unsloth not installed. Install with: pip install unsloth")
    print("Falling back to simulation mode for testing.")

OUTPUT_DIR = "${runDir}"
DATA_PATH = "${trainDataPath}"
BASE_MODEL = "${baseModel}"
EPOCHS = ${epochs}
MAX_MINUTES = ${budgetMinutes}

def main():
    start = time.time()

    if not HAS_UNSLOTH:
        # Simulation mode — useful for testing the pipeline
        print(f"[SIM] Loading base model: {BASE_MODEL}")
        print(f"[SIM] Training data: {DATA_PATH}")
        time.sleep(2)
        for epoch in range(1, EPOCHS + 1):
            elapsed = time.time() - start
            if elapsed > MAX_MINUTES * 60:
                print(f"[SIM] Time budget exhausted at epoch {epoch}")
                break
            loss = 2.5 - (epoch * 0.3)
            print(f"Epoch {epoch}/{EPOCHS} — loss: {loss:.4f}")
            time.sleep(1)

        # Write results
        with open(os.path.join(OUTPUT_DIR, "results.json"), "w") as f:
            json.dump({"status": "simulated", "epochs": EPOCHS, "final_loss": 0.8, "model_path": None}, f)
        print("Training complete (simulated)")
        return

    # Real training with unsloth
    print(f"Loading base model: {BASE_MODEL}")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=BASE_MODEL,
        max_seq_length=2048,
        dtype=None,  # Auto-detect
        load_in_4bit=True,
    )

    model = FastLanguageModel.get_peft_model(
        model,
        r=16,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_alpha=16,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
    )

    dataset = load_dataset("json", data_files=DATA_PATH, split="train")

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        max_seq_length=2048,
        args=TrainingArguments(
            output_dir=OUTPUT_DIR,
            per_device_train_batch_size=2,
            gradient_accumulation_steps=4,
            num_train_epochs=EPOCHS,
            learning_rate=2e-4,
            fp16=True,
            logging_steps=1,
            save_strategy="epoch",
            max_steps=-1,
        ),
    )

    print("Starting training...")
    result = trainer.train()

    # Save
    model.save_pretrained(os.path.join(OUTPUT_DIR, "lora_adapter"))
    tokenizer.save_pretrained(os.path.join(OUTPUT_DIR, "lora_adapter"))

    with open(os.path.join(OUTPUT_DIR, "results.json"), "w") as f:
        json.dump({
            "status": "completed",
            "epochs": EPOCHS,
            "final_loss": result.training_loss,
            "model_path": os.path.join(OUTPUT_DIR, "lora_adapter"),
        }, f)

    print(f"Training complete — loss: {result.training_loss:.4f}")

if __name__ == "__main__":
    main()
`;

    const scriptPath = join(runDir, 'train.py');
    writeFileSync(scriptPath, trainScript, 'utf-8');

    // Launch training as background process
    try {
        execSync(`python3 "${scriptPath}" > "${join(runDir, 'train.log')}" 2>&1 &`, {
            stdio: 'pipe',
            timeout: 5000,
        });
    } catch {
        // Background process launch — may appear to "fail" but actually started
        logger.info(COMPONENT, 'Training process launched in background');
    }

    // Save run metadata
    writeFileSync(join(runDir, 'meta.json'), JSON.stringify(run, null, 2), 'utf-8');

    return [
        `## Training Started`,
        ``,
        `| Setting | Value |`,
        `|---------|-------|`,
        `| Run ID | ${runId} |`,
        `| Base model | ${baseModel} |`,
        `| Method | ${method} |`,
        `| Training samples | ${dataLines.length} |`,
        `| Epochs | ${epochs} |`,
        `| Budget | ${budgetMinutes} min |`,
        ``,
        `Training log: \`${join(runDir, 'train.log')}\``,
        `Use \`train_status\` to check progress.`,
    ].join('\n');
}

async function trainStatus(args: Record<string, unknown>): Promise<string> {
    const runId = args.runId as string | undefined;

    if (runId) {
        const runDir = join(TRAINING_RUNS_DIR, runId);
        if (!existsSync(runDir)) {
            return `Training run "${runId}" not found.`;
        }

        const logPath = join(runDir, 'train.log');
        const resultsPath = join(runDir, 'results.json');

        const lines: string[] = [`## Training Run: ${runId}\n`];

        if (existsSync(resultsPath)) {
            const results = JSON.parse(readFileSync(resultsPath, 'utf-8'));
            lines.push(`**Status**: ${results.status}`);
            lines.push(`**Final loss**: ${results.final_loss}`);
            lines.push(`**Epochs**: ${results.epochs}`);
            if (results.model_path) {
                lines.push(`**Model path**: ${results.model_path}`);
            }
        } else if (existsSync(logPath)) {
            const log = readFileSync(logPath, 'utf-8');
            const lastLines = log.trim().split('\n').slice(-10);
            lines.push('**Status**: training...\n');
            lines.push('### Recent log output:');
            lines.push('```');
            lines.push(lastLines.join('\n'));
            lines.push('```');
        } else {
            lines.push('**Status**: waiting to start...');
        }

        return lines.join('\n');
    }

    // List all runs
    const lines: string[] = ['## Training Runs\n'];

    if (existsSync(TRAINING_RUNS_DIR)) {
        const dirs = readdirSync(TRAINING_RUNS_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .sort()
            .reverse();

        if (dirs.length > 0) {
            lines.push('| Run ID | Base Model | Status | Loss | Samples |');
            lines.push('|--------|-----------|--------|------|---------|');

            for (const dir of dirs.slice(0, 10)) {
                const metaPath = join(TRAINING_RUNS_DIR, dir, 'meta.json');
                const resultsPath = join(TRAINING_RUNS_DIR, dir, 'results.json');

                if (existsSync(metaPath)) {
                    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
                    let status = 'unknown';
                    let loss = '-';

                    if (existsSync(resultsPath)) {
                        const results = JSON.parse(readFileSync(resultsPath, 'utf-8'));
                        status = results.status || 'completed';
                        loss = results.final_loss?.toFixed(4) || '-';
                    } else {
                        status = 'training...';
                    }

                    lines.push(`| ${dir} | ${meta.baseModel} | ${status} | ${loss} | ${meta.dataPoints} |`);
                }
            }
        } else {
            lines.push('No training runs found. Use `train_prepare` then `train_start` to begin.');
        }
    } else {
        lines.push('No training runs found.');
    }

    return lines.join('\n');
}

async function trainDeploy(args: Record<string, unknown>): Promise<string> {
    const runId = args.runId as string;
    const modelName = (args.modelName as string) || 'titan-custom';

    if (!runId) {
        return 'Error: runId is required. Use `train_status` to find completed runs.';
    }

    const runDir = join(TRAINING_RUNS_DIR, runId);
    const resultsPath = join(runDir, 'results.json');

    if (!existsSync(resultsPath)) {
        return `Training run "${runId}" not found or not completed.`;
    }

    const results = JSON.parse(readFileSync(resultsPath, 'utf-8'));
    if (results.status === 'simulated') {
        return [
            `## Deploy — Simulated Run`,
            ``,
            `This was a simulated training run (unsloth not installed).`,
            `To deploy a real model:`,
            `1. Install unsloth on Titan PC: \`pip install unsloth\``,
            `2. Run \`train_start\` again for real training`,
            `3. Then \`train_deploy\` to create an Ollama model`,
        ].join('\n');
    }

    if (!results.model_path || !existsSync(results.model_path)) {
        return `Model adapter not found at ${results.model_path}. Training may not have completed successfully.`;
    }

    // Create Modelfile for Ollama
    const config = loadConfig();
    const trainingConfig = (config as Record<string, unknown>).training as Record<string, unknown> | undefined;
    const baseModel = (trainingConfig?.baseModel as string) || 'qwen3.5:35b';

    const modelfilePath = join(runDir, 'Modelfile');
    const modelfileContent = `FROM ${baseModel}
ADAPTER ${results.model_path}

PARAMETER temperature 0.7
PARAMETER num_ctx 65536

SYSTEM You are TITAN, an intelligent task automation agent. You help users accomplish complex tasks by selecting and using the right tools efficiently.
`;

    writeFileSync(modelfilePath, modelfileContent, 'utf-8');

    // Try to create Ollama model
    try {
        logger.info(COMPONENT, `Creating Ollama model: ${modelName}`);
        execSync(`ollama create ${modelName} -f "${modelfilePath}"`, {
            stdio: 'pipe',
            timeout: 300_000, // 5 min timeout for model creation
        });

        // Optionally switch TITAN's model
        const autoDeploy = trainingConfig?.autoDeploy;
        let switchedModel = false;
        if (autoDeploy) {
            try {
                const { saveConfig } = await import('../../config/config.js');
                const currentConfig = loadConfig();
                currentConfig.agent.model = `ollama/${modelName}`;
                saveConfig(currentConfig);
                switchedModel = true;
            } catch (e) {
                logger.warn(COMPONENT, `Auto-deploy config update failed: ${(e as Error).message}`);
            }
        }

        // Update run
        results.status = 'deployed';
        results.deployedModel = `ollama/${modelName}`;
        writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf-8');

        return [
            `## Model Deployed`,
            ``,
            `| Setting | Value |`,
            `|---------|-------|`,
            `| Model name | ${modelName} |`,
            `| Ollama ID | ollama/${modelName} |`,
            `| Base model | ${baseModel} |`,
            `| Final loss | ${results.final_loss} |`,
            `| Auto-switched | ${switchedModel ? 'yes' : 'no'} |`,
            ``,
            switchedModel
                ? `TITAN is now using \`ollama/${modelName}\` as its default model.`
                : `Model available as \`ollama/${modelName}\`. Use \`/model ollama/${modelName}\` to switch.`,
        ].join('\n');
    } catch (err) {
        return `Error creating Ollama model: ${(err as Error).message}\n\nMake sure Ollama is running and accessible.`;
    }
}

// ── Registration ─────────────────────────────────────────────────────

export function registerModelTrainerSkill(): void {

    registerSkill(
        {
            name: 'model_trainer',
            description: 'Fine-tune local LLM models on TITAN\'s conversation history using GPU',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'train_prepare',
            description: 'Prepare training data from TITAN\'s conversation history. Extracts high-quality instruction/response pairs, scores them by tool success rates, and saves as JSONL.',
            parameters: {
                type: 'object',
                properties: {
                    minSamples: {
                        type: 'number',
                        description: 'Minimum training samples required (default: 50)',
                    },
                },
                required: [],
            },
            execute: trainPrepare,
        },
    );

    registerSkill(
        {
            name: 'model_trainer',
            description: 'Fine-tune local LLM models on TITAN\'s conversation history using GPU',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'train_start',
            description: 'Launch a LoRA fine-tuning job on the local GPU. Uses unsloth for efficient training. Runs as a background process.',
            parameters: {
                type: 'object',
                properties: {
                    baseModel: {
                        type: 'string',
                        description: 'Base model to fine-tune (default: from config, e.g. qwen3.5:35b)',
                    },
                    method: {
                        type: 'string',
                        description: 'Training method: lora, qlora, full (default: lora)',
                    },
                    budgetMinutes: {
                        type: 'number',
                        description: 'Training time budget in minutes (default: 30)',
                    },
                    epochs: {
                        type: 'number',
                        description: 'Number of training epochs (default: 3)',
                    },
                },
                required: [],
            },
            execute: trainStart,
        },
    );

    registerSkill(
        {
            name: 'model_trainer',
            description: 'Fine-tune local LLM models on TITAN\'s conversation history using GPU',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'train_status',
            description: 'Check training progress — shows log output, loss, and completion status. Without a runId, lists all training runs.',
            parameters: {
                type: 'object',
                properties: {
                    runId: {
                        type: 'string',
                        description: 'Specific training run ID to check (optional)',
                    },
                },
                required: [],
            },
            execute: trainStatus,
        },
    );

    registerSkill(
        {
            name: 'model_trainer',
            description: 'Fine-tune local LLM models on TITAN\'s conversation history using GPU',
            version: '1.0.0',
            source: 'bundled',
            enabled: true,
        },
        {
            name: 'train_deploy',
            description: 'Convert a completed training run into an Ollama model and optionally switch TITAN to use it.',
            parameters: {
                type: 'object',
                properties: {
                    runId: {
                        type: 'string',
                        description: 'Training run ID to deploy (from train_status)',
                    },
                    modelName: {
                        type: 'string',
                        description: 'Name for the new Ollama model (default: titan-custom)',
                    },
                },
                required: ['runId'],
            },
            execute: trainDeploy,
        },
    );

    logger.info(COMPONENT, 'Model trainer skill registered (4 tools)');
}
