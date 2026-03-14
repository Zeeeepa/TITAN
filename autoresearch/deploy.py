"""
TITAN Autoresearch — deploy.py
Deploys a trained LoRA adapter to Ollama and benchmarks base vs fine-tuned.

Pipeline:
1. Create Ollama Modelfile with ADAPTER pointing to LoRA adapter
2. Run `ollama create titan-qwen`
3. Benchmark base model vs fine-tuned on eval cases
4. Save benchmark results

Run: python3 deploy.py [--adapter-path PATH] [--model-name NAME]
"""
import json
import os
import subprocess
import sys
import time
import requests
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from prepare import EVAL_CASES

TITAN_HOME = Path.home() / ".titan"
DEFAULT_ADAPTER = TITAN_HOME / "autoresearch" / "output" / "lora_adapter"
BENCHMARK_PATH = TITAN_HOME / "autoresearch" / "output" / "benchmark_results.json"
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")

BASE_MODEL = "qwen3.5:35b"
DEFAULT_MODEL_NAME = "titan-qwen"


def ollama_generate(model: str, prompt: str, timeout: int = 60) -> str:
    """Call Ollama's generate API."""
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": model,
                "prompt": f"<|im_start|>system\nYou are TITAN, an autonomous AI agent. Use tools when appropriate. Respond concisely.<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n",
                "stream": False,
                "options": {"temperature": 0.3, "num_predict": 256},
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json().get("response", "")
    except Exception as e:
        return f"[ERROR: {e}]"


def evaluate_via_ollama(model: str) -> tuple[float, list[dict]]:
    """Run eval cases against an Ollama model. Returns (score, details)."""
    total = 0
    max_total = 0
    details = []

    for tc in EVAL_CASES:
        max_total += tc["max_score"]
        response = ollama_generate(model, tc["prompt"])
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
        details.append({
            "prompt": tc["prompt"],
            "expected": tc.get("expected_tool", ", ".join(tc.get("expected_answer_contains", []))),
            "response_preview": response[:200],
            "score": score,
            "max_score": tc["max_score"],
        })

    val_score = round((total / max_total) * 100, 2) if max_total > 0 else 0
    return val_score, details


def create_ollama_model(adapter_path: str, model_name: str) -> bool:
    """Create an Ollama model from a LoRA adapter via Modelfile."""
    modelfile_path = Path(adapter_path).parent / "Modelfile"

    modelfile_content = f"""FROM {BASE_MODEL}
ADAPTER {adapter_path}

PARAMETER temperature 0.7
PARAMETER num_ctx 8192

SYSTEM You are TITAN, an intelligent task automation agent. You help users accomplish complex tasks by selecting and using the right tools efficiently. Respond concisely and accurately.
"""
    modelfile_path.write_text(modelfile_content)
    print(f"Modelfile created at {modelfile_path}")

    # Try ollama create
    try:
        result = subprocess.run(
            ["ollama", "create", model_name, "-f", str(modelfile_path)],
            capture_output=True,
            text=True,
            timeout=600,  # 10 min timeout
        )
        if result.returncode == 0:
            print(f"Ollama model '{model_name}' created successfully")
            return True
        else:
            print(f"ollama create failed: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print("ollama create timed out (10 min)")
        return False
    except FileNotFoundError:
        print("ollama command not found")
        return False


def try_gguf_fallback(adapter_path: str, model_name: str) -> bool:
    """Fallback: merge LoRA + convert to GGUF + import to Ollama."""
    print("\nAttempting GGUF conversion fallback...")

    try:
        from unsloth import FastLanguageModel

        print("Loading model for merge...")
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=adapter_path,
            max_seq_length=2048,
            dtype=None,
            load_in_4bit=True,
        )

        gguf_dir = str(Path(adapter_path).parent / "gguf_output")
        os.makedirs(gguf_dir, exist_ok=True)

        print("Saving as GGUF (q4_k_m)...")
        model.save_pretrained_gguf(
            gguf_dir,
            tokenizer,
            quantization_method="q4_k_m",
        )

        # Find the GGUF file
        gguf_files = list(Path(gguf_dir).glob("*.gguf"))
        if not gguf_files:
            print("No GGUF file produced")
            return False

        gguf_path = gguf_files[0]
        print(f"GGUF file: {gguf_path} ({gguf_path.stat().st_size / 1e9:.1f} GB)")

        # Create Modelfile from GGUF
        modelfile_path = Path(gguf_dir) / "Modelfile"
        modelfile_path.write_text(f"""FROM {gguf_path}

PARAMETER temperature 0.7
PARAMETER num_ctx 8192

SYSTEM You are TITAN, an intelligent task automation agent. You help users accomplish complex tasks by selecting and using the right tools efficiently. Respond concisely and accurately.
""")

        result = subprocess.run(
            ["ollama", "create", model_name, "-f", str(modelfile_path)],
            capture_output=True,
            text=True,
            timeout=600,
        )

        if result.returncode == 0:
            print(f"GGUF model '{model_name}' created successfully")
            return True
        else:
            print(f"ollama create from GGUF failed: {result.stderr}")
            return False

    except ImportError:
        print("unsloth not available for GGUF conversion")
        return False
    except Exception as e:
        print(f"GGUF fallback failed: {e}")
        return False


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Deploy LoRA adapter to Ollama")
    parser.add_argument("--adapter-path", default=None, help="Path to LoRA adapter directory")
    parser.add_argument("--model-name", default=None, help="Ollama model name to create")
    parser.add_argument("--type", choices=["router", "agent"], default="router", help="Model type: router (titan-qwen) or agent (titan-agent)")
    parser.add_argument("--benchmark-only", action="store_true", help="Skip deployment, just benchmark")
    parser.add_argument("--skip-benchmark", action="store_true", help="Skip benchmarking")
    args = parser.parse_args()

    # Set defaults based on type
    if args.type == "agent":
        adapter_path = args.adapter_path or str(TITAN_HOME / "autoresearch" / "output" / "agent_lora_adapter")
        model_name = args.model_name or "titan-agent"
    else:
        adapter_path = args.adapter_path or str(DEFAULT_ADAPTER)
        model_name = args.model_name or DEFAULT_MODEL_NAME

    if not Path(adapter_path).exists():
        print(f"Adapter not found at {adapter_path}")
        print("Run train.py first to generate a LoRA adapter.")
        sys.exit(1)

    # Step 1: Deploy to Ollama
    if not args.benchmark_only:
        print(f"\n{'='*60}")
        print(f"Deploying LoRA adapter to Ollama as '{model_name}'")
        print(f"Adapter: {adapter_path}")
        print(f"{'='*60}\n")

        success = create_ollama_model(adapter_path, model_name)
        if not success:
            print("\nDirect LoRA import failed. Trying GGUF conversion...")
            success = try_gguf_fallback(adapter_path, model_name)

        if not success:
            print("\nDeployment failed. Check that Ollama is running and the adapter is valid.")
            sys.exit(1)

    # Step 2: Benchmark
    if not args.skip_benchmark:
        print(f"\n{'='*60}")
        print("Benchmarking: base model vs fine-tuned")
        print(f"{'='*60}\n")

        print(f"Evaluating base model ({BASE_MODEL})...")
        base_score, base_details = evaluate_via_ollama(BASE_MODEL)
        print(f"  Base model val_score: {base_score}")

        print(f"\nEvaluating fine-tuned model ({model_name})...")
        tuned_score, tuned_details = evaluate_via_ollama(model_name)
        print(f"  Fine-tuned val_score: {tuned_score}")

        delta = tuned_score - base_score
        print(f"\n  Improvement: {'+' if delta >= 0 else ''}{delta:.1f} points")

        # Save results
        benchmark = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "base_model": BASE_MODEL,
            "tuned_model": model_name,
            "adapter_path": adapter_path,
            "base_score": base_score,
            "tuned_score": tuned_score,
            "improvement": round(delta, 2),
            "base_details": base_details,
            "tuned_details": tuned_details,
        }

        os.makedirs(BENCHMARK_PATH.parent, exist_ok=True)
        with open(BENCHMARK_PATH, "w") as f:
            json.dump(benchmark, f, indent=2)
        print(f"\nBenchmark results saved to {BENCHMARK_PATH}")

        # Summary table
        print(f"\n{'='*60}")
        print(f"{'Test Case':<40} {'Base':>6} {'Tuned':>6} {'Delta':>6}")
        print(f"{'-'*60}")
        for bd, td in zip(base_details, tuned_details):
            d = td['score'] - bd['score']
            marker = "+" if d > 0 else (" " if d == 0 else "")
            print(f"{bd['prompt'][:38]:<40} {bd['score']:>4}/{bd['max_score']} {td['score']:>4}/{td['max_score']} {marker}{d:>4}")
        print(f"{'-'*60}")
        print(f"{'TOTAL':<40} {base_score:>6} {tuned_score:>6} {'+' if delta >= 0 else ''}{delta:>5.1f}")
        print(f"{'='*60}")


if __name__ == "__main__":
    main()
