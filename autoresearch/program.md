# TITAN Autoresearch: Qwen 3.5 35B Fine-Tuning

## Goal
Fine-tune qwen3.5:35b to be the best possible TITAN agent. The model must excel at:
- **Structured JSON tool calling**: Correct tool name + args, valid JSON every time
- **Tool selection accuracy**: Pick the right tool from TITAN's 149+ tools for any task
- **Concise, accurate responses**: No fluff, direct answers when no tool is needed
- **Multi-step reasoning**: Chain 2-3 tools for complex tasks (search → analyze → respond)
- **Error recovery**: When a tool fails, explain what happened and suggest alternatives
- **System prompt adherence**: Always follow the TITAN agent persona

## TITAN's Tool Categories (52 skill files, 149+ tools)
The model should know when to use each category:

| Category | Key Tools | When to Use |
|----------|-----------|-------------|
| **Web** | `web_search`, `web_read`, `web_act`, `web_fetch`, `smart_form_fill` | Finding info, reading pages, filling forms, browsing |
| **File System** | `read_file`, `write_file`, `list_dir`, `apply_patch` | File operations, code editing |
| **Shell** | `shell` | Running commands, system tasks |
| **Memory** | `memory`, `graph_remember`, `graph_search`, `graph_recall` | Storing/retrieving user preferences, context |
| **Email** | `email_send`, `email_search`, `email_read` | Email operations |
| **Calendar** | `calendar` | Scheduling, events |
| **Browser** | `browse_url`, `skyvern_task`, `skyvern_extract` | Complex web automation |
| **Code** | `code_exec` | Running Python/JS code in sandbox |
| **Research** | `deep_research_pipeline`, `research_pipeline_status` | Multi-source research |
| **Image** | `generate_image`, `analyze_image` | Image creation and analysis |
| **Voice** | `transcribe_audio`, `generate_speech` | Speech-to-text, text-to-speech |
| **Goals** | `goal_create`, `goal_update`, `goal_list` | Task/goal management |
| **Sessions** | `sessions_list`, `sessions_history`, `sessions_send` | Multi-session management |
| **GitHub** | `github_issues`, `github_pr` | Repository management |
| **Weather** | `weather` | Weather lookups |
| **Smart Home** | `ha_devices`, `ha_control`, `ha_status` | Home Assistant integration |
| **PDF** | `pdf` | PDF reading/creation |
| **Data** | `data_analysis` | Data processing and analytics |
| **Reports** | `report_generate`, `report_deliver`, `weekly_report` | Automated reporting |
| **Self-Improve** | `self_improve_start`, `self_improve_status` | Self-improvement system |
| **Personas** | `list_personas`, `switch_persona`, `get_persona` | Persona management |
| **System** | `system_info`, `self_doctor` | System diagnostics |
| **Webhooks** | `webhook` | Event-driven automation |
| **Cron** | `cron` | Scheduled tasks |
| **Leads/Growth** | `lead_scan`, `lead_score`, `experiment_create` | Business automation |

## What You Can Modify
Only modify `train.py`. The `prepare.py` file is fixed.

## Evaluation Metric
The eval script outputs `val_score: X.XX` where higher is better (0-100).
It tests on 10 TITAN-specific tasks:
- Tool selection: weather, web_search, read_file, memory, shell, goal_create, browse_url, list_dir (8 tests)
- Knowledge quality: Docker explanation, race condition explanation (2 tests)

Scoring:
- Full match on tool name = 10 points
- Partial match (first word of tool name in response) = 5 points
- Knowledge: keyword presence ratio * 10 points

## Hyperparameter Ranges (safe to explore)

| Param | Current | Min | Max | Notes |
|-------|---------|-----|-----|-------|
| LORA_RANK | 16 | 4 | 64 | Higher = more params, slower. 16-32 sweet spot for tool calling |
| LORA_ALPHA | 32 | 8 | 128 | Usually 2x rank. Try alpha=rank for sharper learning |
| LORA_DROPOUT | 0.05 | 0 | 0.1 | 0 often works. Try 0 first |
| LEARNING_RATE | 2e-4 | 1e-5 | 5e-4 | Start 2e-4, go lower if loss spikes |
| NUM_EPOCHS | 3 | 1 | 10 | 2-4 typical for 400 examples. Watch for overfitting past 5 |
| BATCH_SIZE | 1 | 1 | 2 | **VRAM limited** — RTX 5090 32GB with 4-bit 32B model. Stay at 1 |
| GRADIENT_ACCUMULATION_STEPS | 8 | 4 | 16 | Effective batch = BATCH_SIZE * GRAD_ACCUM |
| WARMUP_RATIO | 0.03 | 0.01 | 0.1 | % of steps for LR warmup |
| WEIGHT_DECAY | 0.01 | 0 | 0.1 | Regularization. 0.01 is good default |
| MAX_SEQ_LENGTH | 1024 | 512 | 2048 | **VRAM limited** — 1024 is safe, 2048 might OOM |

## DO NOT CHANGE
- `BASE_MODEL` — must stay `"unsloth/Qwen2.5-32B-bnb-4bit"`
- `OUTPUT_DIR` — must stay as-is
- The model loading code (`FastLanguageModel.from_pretrained`)
- The chat template setup (Qwen ChatML format)
- The `evaluate_model` call at the end
- The results logging at the end
- `BATCH_SIZE` should stay at 1 (OOM risk at higher values on this hardware)

## Strategy
1. **Make ONE change per experiment** (scientific method)
2. If `val_score` improves → keep the change
3. If `val_score` drops or stays same → revert
4. **Priority order** for hyperparameter exploration:
   a. Learning rate (most impactful) — try 1e-4, 3e-4, 5e-5
   b. Number of epochs — try 2, 4, 5
   c. LoRA rank — try 8, 32 (with alpha = 2x rank)
   d. Gradient accumulation — try 4, 16
   e. Dropout — try 0, 0.1
   f. Warmup ratio — try 0.05, 0.1
5. Each run logs to `output/results.json` — **review history before each experiment**
6. After hyperparameter tuning, consider modifying the training loop:
   - Add cosine LR scheduler
   - Add gradient clipping
   - Modify target_modules (add/remove layers)

## Advanced Modifications (after basic tuning)
Once basic hyperparams are optimized, try:
- **Data augmentation**: Shuffle instruction phrasing, add synonyms
- **System prompt variations**: Train with different system prompt styles
- **Response format training**: Emphasize JSON structure in format_example
- **Multi-turn training**: Format as multi-turn conversations instead of single-turn
- **Curriculum learning**: Train on easy examples first (single tool), then hard (multi-tool)

## Output Format the Model Should Learn
For tool calls:
```
I will [brief explanation of what I'm doing].

{"tool": "tool_name", "args": {"param1": "value1", "param2": "value2"}}
```

For direct answers (no tool needed):
```
[Concise, accurate answer in 1-3 sentences]
```

For errors:
```
The [tool_name] tool encountered an error: [brief explanation].
Alternative: [suggest another approach or tool]
```

## Experiment Loop Protocol (Karpathy Pattern)
This is a hill-climbing optimizer. Each iteration:
1. Read `output/results.json` to understand what has been tried and what worked
2. Propose ONE modification to `train.py` (search/replace edit)
3. Run training: `python3 train.py` (5 min budget)
4. Read the output to get `val_score`
5. If `val_score` > previous best → **KEEP** the change
6. If `val_score` <= previous best → **REVERT** the change
7. Log the result regardless of keep/revert
8. **Go to step 1. NEVER STOP.** Keep running experiments until time runs out.

## Critical Rules
- **NEVER STOP** running experiments. Do not ask for permission. Do not wait for confirmation. Just keep iterating.
- Do NOT modify `prepare.py`
- Each modification must be ONE small, targeted change
- Always print what you changed and why before running
- Redirect training stdout to a file to avoid context flooding: `python3 train.py > /tmp/train_output.log 2>&1`
- Parse only the `val_score` line from the output file
- Time budget per experiment: `TIME_BUDGET_SECONDS` env var (default: 300s = 5 min)
- Higher `val_score` = better. Baseline is ~78.0, current best is 96.0
- Review `output/results.json` before each experiment to avoid repeating failed approaches
- If training crashes (OOM, error), revert the change immediately and try something smaller
- **Simplicity bias**: Prefer small, clean changes. Complex changes are more likely to break things
- If you've exhausted hyperparameter tuning, move to training loop modifications (format_example, scheduler, etc.)
- Each experiment should be **directly comparable** — same time budget, same data, same evaluation
