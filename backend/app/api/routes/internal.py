import anthropic
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/internal", tags=["internal"])


class LlmCompleteRequest(BaseModel):
    prompt: str
    content: str = ""


class LlmCompleteResponse(BaseModel):
    completion: str


@router.post("/llm/complete", response_model=LlmCompleteResponse)
def complete(payload: LlmCompleteRequest, x_sandbox_token: str = Header(default="")):
    """仅供沙箱容器通过内部专用 Docker 网络（sandbox_net）调用，不面向前端/公网。

    真正的隔离来自沙箱容器只接入 sandbox_net、无公网出口；这里的共享令牌校验是
    第二道防线（纵深防御），不是唯一的保护措施。
    """
    if x_sandbox_token != settings.sandbox_internal_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid sandbox token")

    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ANTHROPIC_API_KEY is not configured, so the LLM cannot be called. Set it in backend/.env and restart the service.",
        )

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    user_message = payload.prompt if not payload.content else f"{payload.prompt}\n\n---\n\n{payload.content}"
    response = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=8192,
        messages=[{"role": "user", "content": user_message}],
    )
    text_parts = [block.text for block in response.content if block.type == "text"]
    return LlmCompleteResponse(completion="".join(text_parts))
