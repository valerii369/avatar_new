"""
Direct cleanup using psycopg2 (PostgreSQL connection).
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
KEEP_TG_ID = 825157864

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set")
    exit(1)

import psycopg2

try:
    conn = psycopg2.connect(DATABASE_URL, connect_timeout=15)
    cur = conn.cursor()
    
    # 1. Find keep_id
    cur.execute("SELECT id, first_name FROM users WHERE tg_id = %s", (KEEP_TG_ID,))
    result = cur.fetchone()
    if not result:
        print(f"❌ User with tg_id={KEEP_TG_ID} not found!")
        exit(1)
    
    keep_id, first_name = result
    print(f"✅ Keeping user: {first_name} (tg_id={KEEP_TG_ID})")
    
    # 2. Get list of users to delete
    cur.execute("SELECT id, first_name, tg_id FROM users WHERE tg_id != %s", (KEEP_TG_ID,))
    other_users = cur.fetchall()
    other_ids = [u[0] for u in other_users]
    
    print(f"\n🗑️  Deleting {len(other_users)} users:")
    for uid, fname, tgid in other_users:
        print(f"   - {fname} (tg_id={tgid})")
    
    if not other_ids:
        print("\nNothing to delete.")
        conn.close()
        exit(0)
    
    # 3. Delete related data
    placeholders = ','.join(['%s'] * len(other_ids))
    
    tables = ["user_insights", "user_portraits", "user_memory", "user_birth_data", "payments"]
    for table in tables:
        try:
            cur.execute(f"DELETE FROM {table} WHERE user_id = ANY(%s::uuid[])", (other_ids,))
            print(f"✅ Cleaned {table}")
        except Exception as e:
            print(f"⚠️  {table}: {e}")
    
    # 4. Clear referred_by for kept user
    try:
        cur.execute(
            "UPDATE users SET referred_by = NULL WHERE id = %s AND referred_by = ANY(%s::uuid[])",
            (keep_id, other_ids)
        )
        print(f"✅ Cleared referred_by")
    except Exception as e:
        print(f"⚠️  referred_by: {e}")
    
    # 5. Delete users
    cur.execute(f"DELETE FROM users WHERE tg_id != %s", (KEEP_TG_ID,))
    deleted_count = cur.rowcount
    print(f"✅ Deleted {deleted_count} users")
    
    conn.commit()
    conn.close()
    print("\n✅ Complete. Database cleaned.")
    
except Exception as e:
    print(f"❌ Error: {e}")
    exit(1)
