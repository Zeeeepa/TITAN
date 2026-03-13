"""
TITAN Autoresearch — prepare.py (FIXED, DO NOT MODIFY)
Prepares training data from TITAN sessions and provides eval functions.
"""
import json
import os
import random
from pathlib import Path

TITAN_HOME = Path.home() / ".titan"
SESSIONS_DIR = TITAN_HOME / "sessions"
DATA_DIR = TITAN_HOME / "autoresearch" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def prepare_training_data():
    """Extract instruction/response pairs from TITAN session files."""
    pairs = []

    session_files = list(SESSIONS_DIR.glob("*.json")) if SESSIONS_DIR.exists() else []

    for sf in session_files:
        try:
            with open(sf) as f:
                session = json.load(f)
            messages = session.get("messages", [])
            for i in range(len(messages) - 1):
                if messages[i].get("role") == "user" and messages[i + 1].get("role") == "assistant":
                    user_msg = messages[i].get("content", "")
                    asst_msg = messages[i + 1].get("content", "")
                    if len(user_msg) > 10 and len(asst_msg) > 20:
                        pairs.append({"instruction": user_msg, "output": asst_msg})
        except Exception:
            continue

    # Synthetic TITAN-specific examples
    synthetic = [
        {"instruction": "What is the weather in San Francisco?",
         "output": 'I will use the weather tool.\n\n{"tool": "weather", "args": {"location": "San Francisco"}}'},
        {"instruction": "Search the web for latest AI news",
         "output": 'I will search for the latest AI news.\n\n{"tool": "web_search", "args": {"query": "latest AI news 2026"}}'},
        {"instruction": "Read the file at /tmp/test.txt",
         "output": 'I will read that file.\n\n{"tool": "read_file", "args": {"path": "/tmp/test.txt"}}'},
        {"instruction": "Remember that my favorite color is blue",
         "output": 'I will save that to memory.\n\n{"tool": "memory", "args": {"action": "store", "key": "favorite_color", "value": "blue"}}'},
        {"instruction": "Run ls -la",
         "output": 'I will execute that command.\n\n{"tool": "shell", "args": {"command": "ls -la"}}'},
        {"instruction": "Create a file called hello.txt with Hello World",
         "output": 'I will create that file.\n\n{"tool": "write_file", "args": {"path": "hello.txt", "content": "Hello World"}}'},
        {"instruction": "Search my emails for invoices",
         "output": 'I will search your emails.\n\n{"tool": "email_search", "args": {"query": "invoice"}}'},
        {"instruction": "Navigate to google.com",
         "output": 'I will open that URL.\n\n{"tool": "browse_url", "args": {"url": "https://google.com"}}'},
        {"instruction": "What GitHub issues are open on TITAN?",
         "output": 'I will check open issues.\n\n{"tool": "github_issues", "args": {"repo": "Djtony707/TITAN", "state": "open"}}'},
        {"instruction": "Generate an image of a sunset",
         "output": 'I will generate that image.\n\n{"tool": "generate_image", "args": {"prompt": "A beautiful sunset over the ocean"}}'},
        {"instruction": "Explain what a REST API is",
         "output": "A REST API is a way for applications to communicate over HTTP using standard methods like GET, POST, PUT, and DELETE to perform CRUD operations on resources identified by URLs."},
        {"instruction": "How do I reverse a string in JavaScript?",
         "output": "Use: `str.split('').reverse().join('')` — splits into chars, reverses, and joins back."},
    ]

    pairs.extend(synthetic)
    random.shuffle(pairs)

    split = max(1, int(len(pairs) * 0.9))
    train_data = pairs[:split]
    val_data = pairs[split:] if split < len(pairs) else pairs[-2:]

    train_path = DATA_DIR / "train.jsonl"
    val_path = DATA_DIR / "val.jsonl"

    with open(train_path, "w") as f:
        for p in train_data:
            f.write(json.dumps(p) + "\n")
    with open(val_path, "w") as f:
        for p in val_data:
            f.write(json.dumps(p) + "\n")

    print(f"Prepared {len(train_data)} training and {len(val_data)} validation examples")
    return train_path, val_path


# ── Evaluation ──────────────────────────────────────────────────────

EVAL_CASES = [
    {"prompt": "What is the weather in NYC?", "expected_tool": "weather", "max_score": 10},
    {"prompt": "Search the web for Python tutorials", "expected_tool": "web_search", "max_score": 10},
    {"prompt": "Read /etc/hostname", "expected_tool": "read_file", "max_score": 10},
    {"prompt": "Remember my birthday is March 15", "expected_tool": "memory", "max_score": 10},
    {"prompt": "Run whoami", "expected_tool": "shell", "max_score": 10},
    {"prompt": "Explain Docker in one sentence", "expected_answer_contains": ["container", "isolat"], "max_score": 10},
    {"prompt": "What is a race condition?", "expected_answer_contains": ["concurrent", "thread", "simultaneous"], "max_score": 10},
    {"prompt": "Create a goal to learn Python", "expected_tool": "goal_create", "max_score": 10},
    {"prompt": "Navigate to github.com", "expected_tool": "browse_url", "max_score": 10},
    {"prompt": "List files in the current directory", "expected_tool": "list_dir", "max_score": 10},
]


def evaluate_model(generate_fn):
    """
    Evaluate a model using TITAN-specific test cases.
    generate_fn: callable(prompt) -> str
    Returns: val_score (0-100)
    """
    total = 0
    max_total = 0

    for tc in EVAL_CASES:
        max_total += tc["max_score"]
        try:
            response = generate_fn(tc["prompt"])
            score = 0

            if "expected_tool" in tc:
                tool = tc["expected_tool"]
                tool_quoted = f'"tool": "{tool}"'
                if tool in response.lower() or tool_quoted in response:
                    score = tc["max_score"]
                elif any(kw in response.lower() for kw in [tool.split("_")[0], tool.replace("_", " ")]):
                    score = tc["max_score"] // 2

            elif "expected_answer_contains" in tc:
                matches = sum(1 for kw in tc["expected_answer_contains"] if kw.lower() in response.lower())
                score = int((matches / len(tc["expected_answer_contains"])) * tc["max_score"])

            total += score
        except Exception:
            pass

    val_score = round((total / max_total) * 100, 2) if max_total > 0 else 0
    print(f"val_score: {val_score}")
    return val_score


if __name__ == "__main__":
    prepare_training_data()
    print("Data preparation complete. Run train.py to start training.")
