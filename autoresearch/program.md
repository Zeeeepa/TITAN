# TITAN Autoresearch: Qwen 3.5 35B Fine-Tuning

## Goal
Fine-tune qwen3.5:35b to be a better TITAN agent. The model should excel at:
- Structured JSON tool calling
- Following system prompts precisely
- Selecting the correct tool for each task
- Providing concise, accurate responses
- Graceful error recovery

## What You Can Modify
Only modify `train.py`. The `prepare.py` file is fixed.

## Evaluation Metric
The eval script outputs `val_score: X.XX` where higher is better (0-100).
It tests the fine-tuned model on TITAN-specific tasks:
- Tool selection accuracy (does it pick the right tool?)
- JSON output reliability (can it produce valid JSON?)
- Response quality and conciseness

## Strategy
- Start with small LoRA rank (8-16) and iterate
- Adjust learning rate, epochs, batch size
- Try different data filtering strategies
- Each training run is budgeted to 5 minutes wall clock
- Higher `val_score` = better

## Rules
- Do NOT modify prepare.py
- Keep training under 5 minutes
- Each modification should be a small, targeted change
- Track what you tried and what worked
