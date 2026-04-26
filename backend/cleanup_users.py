"""
One-time cleanup: delete all users except tg_id=825157864
and all their related data.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
KEEP_TG_ID = 825157864

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 1. Find the user to keep
keep_res = supabase.table("users").select("id,tg_id,first_name").eq("tg_id", KEEP_TG_ID).execute()
if not keep_res.data:
    print(f"❌ User with tg_id={KEEP_TG_ID} not found!")
    exit(1)

keep_user = keep_res.data[0]
keep_id = keep_user["id"]
print(f"✅ Keeping user: {keep_user['first_name']} (id={keep_id}, tg_id={KEEP_TG_ID})")

# 2. Get all other user IDs
all_res = supabase.table("users").select("id,tg_id,first_name").neq("tg_id", KEEP_TG_ID).execute()
other_users = all_res.data or []
other_ids = [u["id"] for u in other_users]

print(f"\n🗑️  Users to delete ({len(other_users)}):")
for u in other_users:
    print(f"   - {u.get('first_name','?')} (tg_id={u['tg_id']})")

if not other_ids:
    print("\nНичего удалять.")
    exit(0)

# 3. Delete related data for each user
RELATED_TABLES = ["user_birth_data", "user_insights", "user_portraits", "user_memory", "payments"]

for table in RELATED_TABLES:
    try:
        for uid in other_ids:
            supabase.table(table).delete().eq("user_id", uid).execute()
        print(f"✅ Cleaned {table}")
    except Exception as e:
        print(f"⚠️  {table}: {e}")

# 4. Clear referred_by for kept user if it points to deleted user
try:
    supabase.table("users").update({"referred_by": None}).eq("id", keep_id).in_("referred_by", other_ids).execute()
except Exception as e:
    print(f"⚠️  referred_by cleanup: {e}")

# 5. Delete the users themselves
try:
    for uid in other_ids:
        supabase.table("users").delete().eq("id", uid).execute()
    print(f"✅ Deleted {len(other_ids)} users from users table")
except Exception as e:
    print(f"❌ users delete error: {e}")

print("\n✅ Done. Только ты остался в базе.")
