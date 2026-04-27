#!/usr/bin/env python3
"""Monitor transcription logs via backend API."""

import requests
import time
from datetime import datetime

API_BASE = "http://localhost:8000"
last_id = None

print("🎤 Monitoring transcription logs via API...\n")

while True:
    try:
        response = requests.get(f"{API_BASE}/api/assistant-v2/monitor-transcribe", timeout=5)

        if response.status_code == 200:
            data = response.json()
            logs = data.get('logs', [])

            if logs:
                # Show new logs
                for log in reversed(logs):
                    global last_id
                    if last_id is None or log.get('id') > last_id:
                        error_type = log.get('error_type', '')
                        user_id = log.get('user_id', 'unknown')
                        message = log.get('message', '')
                        context = log.get('context', '')
                        created = log.get('created_at', '')

                        # Format timestamp
                        if created:
                            try:
                                dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                                time_str = dt.strftime('%H:%M:%S')
                            except:
                                time_str = 'N/A'
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
        else:
            print(f"❌ API Error: {response.status_code}")

        time.sleep(2)

    except requests.exceptions.ConnectionError:
        print("⚠️  Cannot connect to backend. Is it running on localhost:8000?")
        time.sleep(5)
    except Exception as e:
        print(f"❌ Error: {e}")
        time.sleep(5)
