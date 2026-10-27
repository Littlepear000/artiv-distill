FROM python:3.11-slim

# Optional PyPI mirror for builds behind slow links (e.g. Aliyun ECS): --build-arg PIP_INDEX_URL=...
ARG PIP_INDEX_URL=https://pypi.org/simple

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --index-url "$PIP_INDEX_URL" -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
