import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_USER = "postgres.gltglzxcjitbdwhqgyre"
DB_HOST = "aws-0-eu-central-1.pooler.supabase.com"
DB_PORT = "6543"
DB_NAME = "postgres"

# The user will provide this in .env
DB_PASSWORD = os.getenv("SUPABASE_DB_PASSWORD")

if not DB_PASSWORD:
    print("ERROR: SUPABASE_DB_PASSWORD is not set in .env")
    exit(1)

connection_string = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

def run_migrations():
    print(f"Connecting to {DB_HOST}...")
    try:
        conn = psycopg2.connect(connection_string)
        conn.autocommit = True
        cur = conn.cursor()
        
        schema_path = os.path.join(os.path.dirname(__file__), "supabase_schema.sql")
        with open(schema_path, "r") as f:
            sql = f.read()
            
        print("Executing schema migrations...")
        cur.execute(sql)
        print("Done! All tables and functions created successfully.")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    run_migrations()
