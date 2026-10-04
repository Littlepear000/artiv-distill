import os
import sys
import traceback

sys.path.insert(0, "/sandbox")
from sdk import SandboxSDK  # noqa: E402

WORKSPACE = "/workspace"


def main() -> int:
    sdk = SandboxSDK(
        input_dir=os.path.join(WORKSPACE, "input"),
        output_dir=os.path.join(WORKSPACE, "output"),
        manifest_path=os.path.join(WORKSPACE, "manifest.json"),
        prompt_path=os.path.join(WORKSPACE, "prompt.txt"),
        llm_proxy_url=os.environ.get("LLM_PROXY_URL"),
        llm_proxy_token=os.environ.get("LLM_PROXY_TOKEN"),
    )

    code_path = os.path.join(WORKSPACE, "node_code.py")
    has_code = os.path.exists(code_path) and os.path.getsize(code_path) > 0

    try:
        if has_code:
            with open(code_path, encoding="utf-8") as f:
                source = f.read()
            namespace: dict = {}
            exec(compile(source, "node_code.py", "exec"), namespace)
            run_fn = namespace.get("run")
            if run_fn is None:
                raise RuntimeError("Node Code must define a run(sdk) function")
            run_fn(sdk)
        else:
            sdk.run_default_behavior()
    except Exception:
        with open(os.path.join(WORKSPACE, "output", "__error__.txt"), "w", encoding="utf-8") as f:
            f.write(traceback.format_exc())
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
