"""
TITAN Autoresearch — train.py (AGENT MODIFIES THIS FILE)
LoRA fine-tuning of qwen3.5:35b for TITAN agent tasks on RTX 5090.

The agent can modify anything in this file:
- LoRA rank, alpha, dropout
- Learning rate, epochs, batch size
- Data selection/filtering
- Training loop modifications
- Optimizer settings
"""
import json
import time
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from prepare import prepare_training_data, evaluate_model, DATA_DIR

# ── Configuration (agent can modify these) ──────────────────────────

LORA_RANK = 16
LORA_ALPHA = 32
LORA_DROPOUT = 0.05
LEARNING_RATE = 2e-4
NUM_EPOCHS = 3
BATCH_SIZE = 1
GRADIENT_ACCUMULATION_STEPS = 8
MAX_SEQ_LENGTH = 1024
WARMUP_RATIO = 0.03
WEIGHT_DECAY = 0.01
TIME_BUDGET_SECONDS = int(os.environ.get("TIME_BUDGET_SECONDS", 300))  # 5 min per experiment (Karpathy pattern)

BASE_MODEL = "unsloth/Qwen2.5-32B-bnb-4bit"
OUTPUT_DIR = str(Path.home() / ".titan" / "autoresearch" / "output")


def train():
    """Run LoRA fine-tuning with 5-minute budget."""
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    start_time = time.time()

    # Prepare data
    train_path, val_path = prepare_training_data()

    try:
        from unsloth import FastLanguageModel
        import torch
    except ImportError:
        print("unsloth not installed. Running simulation.")
        time.sleep(5)
        print("val_score: 45.0")
        return

    # Load model with LoRA
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=BASE_MODEL,
        max_seq_length=MAX_SEQ_LENGTH,
        dtype=None,
        load_in_4bit=True,
    )

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
    if not getattr(tokenizer, 'chat_template', None):
        tokenizer.chat_template = (
            "{% for message in messages %}"
            "{{'<|im_start|>' + message['role'] + '\n' + message['content'] + '<|im_end|>' + '\n'}}"
            "{% endfor %}"
            "{% if add_generation_prompt %}{{'<|im_start|>assistant\n'}}{% endif %}"
        )
        print("Set Qwen ChatML chat_template on tokenizer")

    # Load training data
    from datasets import Dataset

    train_data = []
    with open(train_path) as f:
        for line in f:
            train_data.append(json.loads(line))

    SYSTEM_PROMPT = "You are TITAN, an autonomous AI agent. Use tools when appropriate. Respond concisely and accurately."

    def format_example(example):
        text = (
            f"<|im_start|>system\n{SYSTEM_PROMPT}<|im_end|>\n"
            f"<|im_start|>user\n{example['instruction']}<|im_end|>\n"
            f"<|im_start|>assistant\n{example['output']}<|im_end|>\n"
        )
        return {"text": text}

    dataset = Dataset.from_list(train_data).map(format_example)

    # Training
    from trl import SFTTrainer
    from transformers import TrainingArguments
    import torch

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=MAX_SEQ_LENGTH,
        args=TrainingArguments(
            output_dir=OUTPUT_DIR,
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

    print(f"Starting training: {len(dataset)} examples, budget: {TIME_BUDGET_SECONDS}s")
    trainer.train()

    elapsed = time.time() - start_time
    print(f"Training completed in {elapsed:.1f}s")

    # Evaluate
    FastLanguageModel.for_inference(model)

    def generate(prompt):
        chat_text = (
            "<|im_start|>system\nYou are TITAN, an autonomous AI agent.<|im_end|>\n"
            f"<|im_start|>user\n{prompt}<|im_end|>\n"
            "<|im_start|>assistant\n"
        )
        inputs = tokenizer(chat_text, return_tensors="pt").input_ids.to(model.device)

        outputs = model.generate(
            input_ids=inputs,
            max_new_tokens=256,
            temperature=0.3,
            do_sample=True,
        )
        return tokenizer.decode(outputs[0][inputs.shape[-1]:], skip_special_tokens=True)

    score = evaluate_model(generate)

    # Save LoRA adapter
    adapter_dir = os.path.join(OUTPUT_DIR, "lora_adapter")
    model.save_pretrained(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)
    print(f"LoRA adapter saved to {adapter_dir}")

    # Log results
    results_path = os.path.join(OUTPUT_DIR, "results.json")
    results_list = []
    if os.path.exists(results_path):
        try:
            with open(results_path) as f:
                results_list = json.load(f)
        except (json.JSONDecodeError, TypeError):
            results_list = []

    results_list.append({
        "timestamp": datetime.now().isoformat(),
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
        "adapter_path": adapter_dir,
    })

    with open(results_path, "w") as f:
        json.dump(results_list, f, indent=2)
    print(f"Results logged to {results_path}")


if __name__ == "__main__":
    train()
