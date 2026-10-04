"""节点 Code 的沙箱化执行：每次节点运行启动一个一次性 Docker 容器。

安全设计（对应架构方案第6节）：
- 容器只挂载 sandbox_network（Docker internal 网络），没有公网出口，
  唯一能连通的服务是后端自己的 /internal/llm/complete 代理接口（用于 Prompt 的 AI 调用）
- 容器根文件系统只读，仅 /workspace 下的几个挂载点可写
- 资源限制：内存、CPU、执行超时
- 用完即删（容器 + 临时文件），不在宿主机留痕

已知的生产加固项（本阶段未做，仅记录）：以非 root 用户运行容器、每次运行使用
独立的内部访问令牌而非共享静态密钥、更细粒度的 egress 控制。
"""
import json
import os
import tempfile
import uuid

import docker
from docker.errors import APIError

from app.config import settings


class SandboxExecutionError(Exception):
    pass


def _to_host_path(worker_local_path: str) -> str:
    """把 worker 容器自己视角下的路径，翻译成宿主机 Docker daemon 能识别的真实路径。

    worker 通过挂载的 docker.sock 调用的其实是宿主机的 daemon（sibling containers
    模式），daemon 眼里的 volume 源路径必须是宿主机路径 —— worker 容器内部路径对它
    来说毫无意义。因此临时文件必须建在 sandbox_tmp_dir 这个共享挂载点下，再替换前缀。
    """
    if not settings.host_sandbox_tmp_dir:
        raise SandboxExecutionError(
            "HOST_SANDBOX_TMP_DIR is not configured, so the worker container's temp path cannot be translated to a host path"
        )
    if not worker_local_path.startswith(settings.sandbox_tmp_dir):
        raise SandboxExecutionError(f"Temp file path {worker_local_path} is not under the shared mount directory")
    suffix = worker_local_path[len(settings.sandbox_tmp_dir):]
    return settings.host_sandbox_tmp_dir.rstrip("/") + suffix


def run_node_sandbox(
    code: str, prompt: str, input_files: dict[str, bytes], timeout_seconds: int = 120
) -> tuple[dict[str, bytes], str]:
    """在沙箱容器里执行一个节点。

    input_files: {文件名: 字节内容}
    返回 (输出文件 {文件名: 字节内容}, 容器日志)
    失败时抛出 SandboxExecutionError。
    """
    client = docker.from_env()

    os.makedirs(settings.sandbox_tmp_dir, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="pdf-workflow-node-", dir=settings.sandbox_tmp_dir) as workdir:
        input_dir = os.path.join(workdir, "input")
        output_dir = os.path.join(workdir, "output")
        os.makedirs(input_dir)
        os.makedirs(output_dir)

        for name, data in input_files.items():
            with open(os.path.join(input_dir, name), "wb") as f:
                f.write(data)

        manifest_path = os.path.join(workdir, "manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(list(input_files.keys()), f)

        code_path = os.path.join(workdir, "node_code.py")
        with open(code_path, "w", encoding="utf-8") as f:
            f.write(code or "")

        prompt_path = os.path.join(workdir, "prompt.txt")
        with open(prompt_path, "w", encoding="utf-8") as f:
            f.write(prompt or "")

        container = None
        logs = ""
        try:
            container = client.containers.run(
                settings.sandbox_image,
                environment={
                    "LLM_PROXY_URL": settings.llm_proxy_url,
                    "LLM_PROXY_TOKEN": settings.sandbox_internal_token,
                },
                volumes={
                    _to_host_path(input_dir): {"bind": "/workspace/input", "mode": "ro"},
                    _to_host_path(output_dir): {"bind": "/workspace/output", "mode": "rw"},
                    _to_host_path(manifest_path): {"bind": "/workspace/manifest.json", "mode": "ro"},
                    _to_host_path(code_path): {"bind": "/workspace/node_code.py", "mode": "ro"},
                    _to_host_path(prompt_path): {"bind": "/workspace/prompt.txt", "mode": "ro"},
                },
                network=settings.sandbox_network,
                mem_limit="512m",
                nano_cpus=1_000_000_000,
                read_only=True,
                tmpfs={"/tmp": "size=64m"},
                cap_drop=["ALL"],
                security_opt=["no-new-privileges"],
                detach=True,
                name=f"pdf-workflow-node-{uuid.uuid4().hex[:12]}",
            )
            try:
                result = container.wait(timeout=timeout_seconds)
                exit_code = result.get("StatusCode", 1)
            except Exception as exc:
                container.kill()
                raise SandboxExecutionError(f"Node execution timed out (exceeded {timeout_seconds} seconds) and was terminated") from exc
            logs = container.logs(stdout=True, stderr=True).decode("utf-8", errors="replace")
        except APIError as exc:
            raise SandboxExecutionError(f"Failed to start sandbox container: {exc}") from exc
        finally:
            if container is not None:
                try:
                    container.remove(force=True)
                except Exception:
                    pass

        error_file = os.path.join(output_dir, "__error__.txt")
        if os.path.exists(error_file):
            with open(error_file, "r", encoding="utf-8") as f:
                raise SandboxExecutionError(f.read() or "Node code execution failed")

        if exit_code != 0:
            raise SandboxExecutionError(f"Node container exited abnormally (exit code {exit_code})\n{logs[-4000:]}")

        output_files = {}
        for fname in os.listdir(output_dir):
            with open(os.path.join(output_dir, fname), "rb") as f:
                output_files[fname] = f.read()

        return output_files, logs
