from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from openai import AsyncOpenAI
import logging
import asyncio
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()
openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    user_id: str
    messages: List[ChatMessage]

class ChatResponse(BaseModel):
    assistant_reply: str

@router.post("/chat", response_model=ChatResponse)
async def chat_with_assistant(req: ChatRequest):
    """
    Assistant chat feature. 
    In the full AVATAR v2.1, this retrieves memory from Supabase using Qdrant.
    Here we implement a robust GPT-4o-mini completion holding basic context.
    """
    try:
        # Convert Pydantic models to dicts for OpenAI
        # We prepend a system prompt 
        messages = [
            {"role": "system", "content": "Ты AVATAR Assistant — продвинутый эзотерический помощник. Можешь обсуждать любые сферы: отношения, трансформацию, предназначение и т.д. Отвечай кратко, емко, экологично и поддерживающе, опираясь на глубинные смыслы."}
        ]
        messages.extend([{"role": m.role, "content": m.content} for m in req.messages])
        
        # We use gpt-4o-mini as specified in AVATAR_ARCHITECTURE_v2.1.md
        resp = await openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=2000
        )
        
        reply_content = resp.choices[0].message.content
        return ChatResponse(assistant_reply=reply_content)
    except Exception as e:
        logger.error(f"Assistant Chat failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to connect to Assistant")
