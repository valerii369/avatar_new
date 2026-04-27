#!/usr/bin/env python3
"""Monitor transcription logs in real-time."""

import os
import sys
import time
from pathlib import Path
from datetime import datetime, timedelta

# Load env from backend
env_file = Path(__file__).parent / "backend" / ".env"
if env_file.exists():
    import subprocess
    result = subprocess.run(f"grep -E '^(SUPABASE_URL|SUPABASE_KEY)=' {env_file}", shell=True, capture_output=True, text=True)
    for line in result.stdout.strip().split('\n'):
        if line:
            key, val = line.split('=', 1)
            os.environ[key] = val

from supabase import create_client

url = os.getenv("SUPABASE_URL", "https://gltglzxcjitbdwhqgyre.supabase.co")
key = os.getenv("SUPABASE_KEY")

if not key:
    print("Error: SUPABASE_KEY not found")
    sys.exit(1)

supabase = create_client(url, key)
last_id = None

print("🎤 Monitoring transcription logs (Ctrl+C to stop)...\n")

while True:
    try:
        # Get recent transcribe-related logs
        query = supabase.table("uis_errors").select("*").ilike("error_type", "%transcribe%").order("created_at", desc=True).limit(50)
        result = query.execute()

        if result.data:
            # Show new logs
            new_logs = []
            for err in result.data:
                if last_id is None or err.get('id') > last_id:
                    new_logs.append(err)

            if new_logs:
                for log in reversed(new_logs):
                    error_type = log.get('error_type', '')
                    user_id = log.get('user_id', 'unknown')
                    message = log.get('message', '')
                    context = log.get('context', '')
                    created = log.get('created_at', '')

                    # Format timestamp
                    if created:
                        dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                        time_str = dt.strftime('%H:%M:%S')
                    else:
                        time_str = 'N/A'

                    # Color coding
                    if 'success' in error_type:
                        status = '✅ SUCCESS'
                    elif 'attempt' in error_type:
                        status = '⏳ ATTEMPT'
                    elif 'error' in error_type:
                        status = '❌ ERROR'
                    else:
                        status = '📝 LOG'

                    print(f"[{time_str}] {status} | User: {user_id}")
                    print(f"  Type: {error_type}")
                    print(f"  Message: {message}")
                    if context:
                        print(f"  Context: {context}")
                    print()

                    last_id = log.get('id')

        time.sleep(2)

    except Exception as e:
        print(f"Error: {e}")
        time.sleep(5)
