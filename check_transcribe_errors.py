#!/usr/bin/env python3
"""Check transcription errors from Supabase."""

import os
import sys
from pathlib import Path

# Load .env
env_file = Path(__file__).parent / "backend" / ".env"
if env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(env_file)

from supabase import create_client

url = os.getenv("SUPABASE_URL", "https://gltglzxcjitbdwhqgyre.supabase.co")
key = os.getenv("SUPABASE_KEY")

if not key:
    print("Error: SUPABASE_KEY not found in environment")
    sys.exit(1)

supabase = create_client(url, key)

# Get recent transcribe errors
result = supabase.table("uis_errors").select("*").ilike("error_type", "%transcribe%").order("created_at", desc=True).limit(20).execute()

print(f"Found {len(result.data)} transcribe-related errors:\n")
for err in result.data:
    print(f"ID: {err.get('id')}")
    print(f"User: {err.get('user_id')}")
    print(f"Type: {err.get('error_type')}")
    print(f"Message: {err.get('message')}")
    print(f"Context: {err.get('context')}")
    print(f"Created: {err.get('created_at')}")
    print("---")
