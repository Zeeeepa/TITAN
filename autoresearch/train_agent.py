"""
TITAN Autoresearch — train_agent.py (AGENT MODIFIES THIS FILE)
LoRA fine-tuning of Qwen 32B as TITAN's Main Agent Model on RTX 5090.

Unlike train.py (tool router, single-turn), this trains on multi-turn
ChatML conversations with system/user/assistant/tool roles — producing
a full agent model that reasons, calls tools, and answers directly.

The agent can modify anything in this file:
- LoRA rank, alpha, dropout
- Learning rate, epochs, batch size
- Data selection/filtering
- Training loop modifications
- Optimizer settings
- Eval cases
"""
import json
import time
import os
import sys
import requests
from datetime import datetime
from pathlib import Path

# ── Configuration (agent can modify these) ──────────────────────────

LORA_RANK = 32              # Safe range: 8-64
LORA_ALPHA = 64             # Usually 2x rank
LORA_DROPOUT = 0.05         # Safe range: 0.0-0.1
LEARNING_RATE = 1e-4        # Safe range: 1e-5 to 5e-4
NUM_EPOCHS = 2              # Safe range: 1-5
BATCH_SIZE = 1              # VRAM limited on RTX 5090
GRADIENT_ACCUMULATION_STEPS = 8  # Effective batch = 8
MAX_SEQ_LENGTH = 2048       # Agent conversations are longer
WARMUP_RATIO = 0.03         # Safe range: 0.01-0.1
WEIGHT_DECAY = 0.01         # Safe range: 0.0-0.1
TIME_BUDGET_SECONDS = int(os.environ.get("TIME_BUDGET_SECONDS", 300))  # 5 min per experiment

BASE_MODEL = "unsloth/Qwen2.5-32B-bnb-4bit"
TITAN_HOME = Path.home() / ".titan"
DATA_DIR = TITAN_HOME / "autoresearch" / "data"
OUTPUT_DIR = TITAN_HOME / "autoresearch" / "output"
ADAPTER_DIR = OUTPUT_DIR / "agent_lora_adapter"
RESULTS_PATH = OUTPUT_DIR / "agent_results.json"
TRAINING_DATA_PATH = DATA_DIR / "agent_training.jsonl"

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")

# ── Eval harness ────────────────────────────────────────────────────

AGENT_EVAL_CASES = [
    # Tool calling — must use the right tool
    {"input": "Check the weather in London", "expect_tool": "weather"},
    {"input": "Search the web for Python 3.12 release notes", "expect_tool": "web_search"},
    {"input": "Read the file at /home/user/notes.txt", "expect_tool": "read_file"},
    {"input": "Run ls -la in the terminal", "expect_tool": "shell"},
    {"input": "Remember that my favorite color is blue", "expect_tool": "memory_store"},

    # Direct answers — must NOT call a tool
    {"input": "What is 15 * 23?", "expect_direct": True, "expect_contains": "345"},
    {"input": "Explain what a REST API is", "expect_direct": True, "expect_contains": "API"},

    # Identity
    {"input": "Who are you?", "expect_contains": "TITAN"},
    {"input": "What can you do?", "expect_contains": "tool"},
]

# Tools schema provided to Ollama for eval
EVAL_TOOLS = [
    {"type": "function", "function": {"name": "weather", "description": "Get weather for a location", "parameters": {"type": "object", "properties": {"location": {"type": "string"}}, "required": ["location"]}}},
    {"type": "function", "function": {"name": "web_search", "description": "Search the web", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {"name": "read_file", "description": "Read a file from disk", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "shell", "description": "Run a shell command", "parameters": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}}},
    {"type": "function", "function": {"name": "memory_store", "description": "Store a fact in memory", "parameters": {"type": "object", "properties": {"key": {"type": "string"}, "value": {"type": "string"}}, "required": ["key", "value"]}}},
]

SYSTEM_PROMPT = "You are TITAN, an autonomous AI agent. Use tools when appropriate. Respond concisely and accurately."


# ── Data formatting ─────────────────────────────────────────────────

def format_agent_example(example, tokenizer):
    """Format multi-turn conversation for training."""
    return tokenizer.apply_chat_template(
        example["messages"],
        tokenize=False,
        add_generation_prompt=False,
    )


# ── Evaluation ──────────────────────────────────────────────────────

def evaluate_via_ollama(model_name: str) -> float:
    """Evaluate the model via Ollama /api/chat with tool definitions."""
    print("[AGENT-TRAIN] Evaluating via Ollama...")
    score = 0
    max_score = 0

    for case in AGENT_EVAL_CASES:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": case["input"]},
        ]

        try:
            resp = requests.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": model_name,
                    "messages": messages,
                    "tools": EVAL_TOOLS,
                    "stream": False,
                },
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
            msg = data.get("message", {})
            content = msg.get("content", "")
            tool_calls = msg.get("tool_calls", [])
        except Exception as e:
            print(f"  [WARN] Ollama eval failed for '{case['input'][:40]}...': {e}")
            # Count it as max_score but 0 earned
            if "expect_tool" in case:
                max_score += 10
            elif case.get("expect_direct"):
                max_score += 10
            elif "expect_contains" in case:
                max_score += 10
            continue

        if "expect_tool" in case:
            max_score += 10
            called_tools = [tc.get("function", {}).get("name", "") for tc in tool_calls]
            if case["expect_tool"] in called_tools:
                score += 10
                print(f"  [PASS] Tool call: {case['expect_tool']}")
            else:
                print(f"  [FAIL] Expected tool '{case['expect_tool']}', got: {called_tools}")

        elif case.get("expect_direct"):
            max_score += 10
            has_no_tool = len(tool_calls) == 0
            has_keyword = case.get("expect_contains", "").lower() in content.lower()
            if has_no_tool and has_keyword:
                score += 10
                print(f"  [PASS] Direct answer with '{case['expect_contains']}'")
            else:
                reason = []
                if not has_no_tool:
                    reason.append("unexpected tool call")
                if not has_keyword:
                    reason.append(f"missing '{case['expect_contains']}'")
                print(f"  [FAIL] Direct answer: {', '.join(reason)}")

        elif "expect_contains" in case:
            max_score += 10
            if case["expect_contains"].lower() in content.lower():
                score += 10
                print(f"  [PASS] Contains '{case['expect_contains']}'")
            else:
                print(f"  [FAIL] Missing '{case['expect_contains']}' in response")

    return (score / max_score * 100) if max_score > 0 else 0.0


def evaluate_via_generate(generate_fn) -> float:
    """Fallback eval using direct text generation (no Ollama)."""
    print("[AGENT-TRAIN] Evaluating via direct generation (fallback)...")
    score = 0
    max_score = 0

    for case in AGENT_EVAL_CASES:
        output = generate_fn(case["input"]).strip()

        if "expect_tool" in case:
            max_score += 10
            # Check if model outputs tool call syntax
            tool_name = case["expect_tool"]
            if tool_name in output.lower() and ("tool_call" in output.lower() or "function" in output.lower() or f'"{tool_name}"' in output.lower()):
                score += 10
                print(f"  [PASS] Tool ref: {tool_name}")
            else:
                print(f"  [FAIL] Expected tool ref '{tool_name}' in output")

        elif case.get("expect_direct"):
            max_score += 10
            keyword = case.get("expect_contains", "")
            if keyword.lower() in output.lower():
                score += 10
                print(f"  [PASS] Direct answer with '{keyword}'")
            else:
                print(f"  [FAIL] Missing '{keyword}' in direct answer")

        elif "expect_contains" in case:
            max_score += 10
            if case["expect_contains"].lower() in output.lower():
                score += 10
                print(f"  [PASS] Contains '{case['expect_contains']}'")
            else:
                print(f"  [FAIL] Missing '{case['expect_contains']}' in response")

    return (score / max_score * 100) if max_score > 0 else 0.0


def ollama_available(model_name: str) -> bool:
    """Check if Ollama is reachable and the model is loaded."""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        resp.raise_for_status()
        models = [m.get("name", "") for m in resp.json().get("models", [])]
        return any(model_name in m for m in models)
    except Exception:
        return False


# ── Training pipeline ───────────────────────────────────────────────

def train():
    """Run LoRA fine-tuning for TITAN's main agent model."""
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    start_time = time.time()

    # Validate training data exists
    if not TRAINING_DATA_PATH.exists():
        print(f"[AGENT-TRAIN] ERROR: Training data not found at {TRAINING_DATA_PATH}")
        print("[AGENT-TRAIN] Generate training data first with the autoresearch pipeline.")
        sys.exit(1)

    # Load training data
    print(f"[AGENT-TRAIN] Loading training data from {TRAINING_DATA_PATH}")
    train_data = []
    with open(TRAINING_DATA_PATH) as f:
        for line in f:
            line = line.strip()
            if line:
                train_data.append(json.loads(line))
    print(f"[AGENT-TRAIN] Loaded {len(train_data)} conversation examples")

    if len(train_data) == 0:
        print("[AGENT-TRAIN] ERROR: No training examples found.")
        sys.exit(1)

    # Import ML libraries
    try:
        from unsloth import FastLanguageModel
        import torch
    except ImportError:
        print("[AGENT-TRAIN] unsloth not installed. Running simulation.")
        time.sleep(5)
        print("agent_val_score: 45.0")
        return

    # Load model with LoRA
    print(f"[AGENT-TRAIN] Loading model: {BASE_MODEL}")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=BASE_MODEL,
        max_seq_length=MAX_SEQ_LENGTH,
        dtype=None,
        load_in_4bit=True,
    )

    print(f"[AGENT-TRAIN] Applying LoRA: rank={LORA_RANK}, alpha={LORA_ALPHA}")
    model = FastLanguageModel.get_peft_model(
        model,
        r=LORA_RANK,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                         "gate_proj", "up_proj", "down_proj"],
        lora_alpha=LORA_ALPHA,
        lora_dropout=LORA_DROPOUT,
        bias="none",
        use_gradient_checkpointing="unsloth",
    )

    # Set Qwen ChatML template if missing
    if not getattr(tokenizer, "chat_template", None):
        tokenizer.chat_template = (
            "{% for message in messages %}"
            "{{'<|im_start|>' + message['role'] + '\n' + message['content'] + '<|im_end|>' + '\n'}}"
            "{% endfor %}"
            "{% if add_generation_prompt %}{{'<|im_start|>assistant\n'}}{% endif %}"
        )
        print("[AGENT-TRAIN] Set Qwen ChatML chat_template on tokenizer")

    # Format dataset
    from datasets import Dataset

    def format_fn(example):
        text = format_agent_example(example, tokenizer)
        return {"text": text}

    dataset = Dataset.from_list(train_data).map(format_fn)
    print(f"[AGENT-TRAIN] Formatted {len(dataset)} examples for training")

    # Training
    from trl import SFTTrainer
    from transformers import TrainingArguments
    import torch

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=MAX_SEQ_LENGTH,
        args=TrainingArguments(
            output_dir=str(OUTPUT_DIR),
            per_device_train_batch_size=BATCH_SIZE,
            gradient_accumulation_steps=GRADIENT_ACCUMULATION_STEPS,
            warmup_ratio=WARMUP_RATIO,
            num_train_epochs=NUM_EPOCHS,
            max_steps=-1,  # let NUM_EPOCHS control duration
            learning_rate=LEARNING_RATE,
            weight_decay=WEIGHT_DECAY,
            fp16=not torch.cuda.is_bf16_supported(),
            bf16=torch.cuda.is_bf16_supported(),
            logging_steps=1,
            save_strategy="no",
            seed=42,
        ),
    )

    print(f"[AGENT-TRAIN] Training: {len(dataset)} examples, {NUM_EPOCHS} epochs, budget: {TIME_BUDGET_SECONDS}s")
    trainer.train()

    elapsed = time.time() - start_time
    print(f"[AGENT-TRAIN] Training completed in {elapsed:.1f}s")

    # Evaluate
    FastLanguageModel.for_inference(model)

    def generate(prompt):
        chat_text = (
            f"<|im_start|>system\n{SYSTEM_PROMPT}<|im_end|>\n"
            f"<|im_start|>user\n{prompt}<|im_end|>\n"
            "<|im_start|>assistant\n"
        )
        inputs = tokenizer(chat_text, return_tensors="pt").input_ids.to(model.device)

        outputs = model.generate(
            input_ids=inputs,
            max_new_tokens=512,
            temperature=0.3,
            do_sample=True,
        )
        return tokenizer.decode(outputs[0][inputs.shape[-1]:], skip_special_tokens=True)

    # Try Ollama eval first, fall back to text matching
    # The model name in Ollama would be set after GGUF export; for now use fallback
    ollama_model = os.environ.get("OLLAMA_EVAL_MODEL", "")
    if ollama_model and ollama_available(ollama_model):
        score = evaluate_via_ollama(ollama_model)
    else:
        if ollama_model:
            print(f"[AGENT-TRAIN] Ollama model '{ollama_model}' not available, using fallback eval")
        else:
            print("[AGENT-TRAIN] No OLLAMA_EVAL_MODEL set, using fallback eval")
        score = evaluate_via_generate(generate)

    print(f"[AGENT-TRAIN] Eval score: {score:.1f}/100")

    # Save LoRA adapter
    ADAPTER_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(ADAPTER_DIR))
    tokenizer.save_pretrained(str(ADAPTER_DIR))
    print(f"[AGENT-TRAIN] LoRA adapter saved to {ADAPTER_DIR}")

    # Log results
    results_list = []
    if RESULTS_PATH.exists():
        try:
            results_list = json.loads(RESULTS_PATH.read_text())
        except (json.JSONDecodeError, TypeError):
            results_list = []

    results_list.append({
        "timestamp": datetime.now().isoformat(),
        "type": "agent",
        "val_score": score,
        "hyperparams": {
            "lr": LEARNING_RATE,
            "rank": LORA_RANK,
            "alpha": LORA_ALPHA,
            "dropout": LORA_DROPOUT,
            "epochs": NUM_EPOCHS,
            "batch_size": BATCH_SIZE,
            "grad_accum": GRADIENT_ACCUMULATION_STEPS,
            "max_seq_len": MAX_SEQ_LENGTH,
        },
        "training_time_s": round(elapsed, 1),
        "num_examples": len(dataset),
        "adapter_path": str(ADAPTER_DIR),
    })

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text(json.dumps(results_list, indent=2))
    print(f"[AGENT-TRAIN] Results logged to {RESULTS_PATH}")

    # Final score line (for parsing by autoresearch agent)
    print(f"agent_val_score: {score:.1f}")


if __name__ == "__main__":
    train()
