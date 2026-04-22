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

        # Run main schema
        schema_path = os.path.join(os.path.dirname(__file__), "supabase_schema.sql")
        with open(schema_path, "r") as f:
            sql = f.read()
        print("Executing schema migrations...")
        cur.execute(sql)

        # Run supplementary migrations
        for migration_file in ["supabase_promo_migration.sql", "migration_missing.sql"]:
            migration_path = os.path.join(os.path.dirname(__file__), migration_file)
            if os.path.exists(migration_path):
                with open(migration_path, "r") as f:
                    sql = f.read()
                print(f"Executing {migration_file}...")
                cur.execute(sql)

        # Run migrations from migrations/ directory
        migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
        if os.path.exists(migrations_dir):
            migration_files = sorted([f for f in os.listdir(migrations_dir) if f.endswith(".sql")])
            for migration_file in migration_files:
                migration_path = os.path.join(migrations_dir, migration_file)
                with open(migration_path, "r") as f:
                    sql = f.read()
                print(f"Executing {migration_file}...")
                cur.execute(sql)

        print("Done! All migrations completed successfully.")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    run_migrations()
