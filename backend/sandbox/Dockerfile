FROM python:3.11-slim

WORKDIR /sandbox

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY sdk.py runner.py .

# 容器根文件系统以只读方式运行（见 app/sandbox.py），/workspace 下的挂载点
# 必须在镜像里预先建好目录，否则只读 rootfs 下 Docker 可能把文件型挂载点
# 误建成目录（IsADirectoryError）
RUN mkdir -p /workspace/input /workspace/output && \
    touch /workspace/manifest.json /workspace/node_code.py /workspace/prompt.txt

ENTRYPOINT ["python", "/sandbox/runner.py"]
