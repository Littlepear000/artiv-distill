"""注入到沙箱容器内的受控 SDK。

节点 Code 不直接拿网络或任意文件系统权限，只能通过这个对象里的方法
读输入 / 写输出 / 调用 LLM —— 这样平台才能审计、限流、并阻止代码绕过沙箱限制。
"""
import json
import os
import shutil

import httpx


class SandboxSDK:
    def __init__(self, input_dir, output_dir, manifest_path, prompt_path, llm_proxy_url, llm_proxy_token):
        self.input_dir = input_dir
        self.output_dir = output_dir
        self.llm_proxy_url = llm_proxy_url
        self.llm_proxy_token = llm_proxy_token

        with open(manifest_path, encoding="utf-8") as f:
            self._manifest = json.load(f)

        self.prompt = ""
        if os.path.exists(prompt_path):
            with open(prompt_path, encoding="utf-8") as f:
                self.prompt = f.read()

    def list_inputs(self) -> list[str]:
        return list(self._manifest)

    def input_path(self, name: str) -> str:
        return os.path.join(self.input_dir, name)

    def read_input_bytes(self, name: str) -> bytes:
        with open(self.input_path(name), "rb") as f:
            return f.read()

    def extract_pdf_text(self, name: str) -> str:
        import fitz  # PyMuPDF

        doc = fitz.open(self.input_path(name))
        try:
            return "\n".join(page.get_text() for page in doc)
        finally:
            doc.close()

    def write_output(self, name: str, data) -> None:
        path = os.path.join(self.output_dir, name)
        if isinstance(data, (bytes, bytearray)):
            with open(path, "wb") as f:
                f.write(data)
        elif isinstance(data, str):
            with open(path, "w", encoding="utf-8") as f:
                f.write(data)
        else:
            raise TypeError("write_output only accepts bytes or str")

    def call_llm(self, prompt: str | None = None, content: str = "") -> str:
        effective_prompt = prompt if prompt is not None else self.prompt
        if not effective_prompt:
            raise ValueError("call_llm requires a prompt (the node has no Prompt configured and none was passed explicitly)")

        response = httpx.post(
            self.llm_proxy_url,
            json={"prompt": effective_prompt, "content": content},
            headers={"X-Sandbox-Token": self.llm_proxy_token},
            timeout=180,
        )
        response.raise_for_status()
        return response.json()["completion"]

    def run_default_behavior(self) -> None:
        """节点 Code 为空时的默认行为。

        配置了 Prompt：把所有输入 PDF 提取出的文本拼接起来调用 LLM，输出为 output.txt
        没配置 Prompt：原样把输入文件透传为输出（占位节点）
        """
        if self.prompt:
            sections = []
            for name in self.list_inputs():
                if name.lower().endswith(".pdf"):
                    sections.append(f"=== {name} ===\n{self.extract_pdf_text(name)}")
            result = self.call_llm(content="\n\n".join(sections))
            self.write_output("output.txt", result)
        else:
            for name in self.list_inputs():
                shutil.copyfile(self.input_path(name), os.path.join(self.output_dir, name))
