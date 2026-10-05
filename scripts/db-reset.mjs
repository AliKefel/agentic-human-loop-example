import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function loadEnv() {
  const txt = fs.readFileSync(".env.local", "utf8");
  for (const line of txt.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();
const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("SUPABASE_DB_URL missing in .env.local");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const tables = ["audit_log","incidents","memories","founder_messages","approvals","tool_calls","agent_calls","checkpoints","runs","harness_configs","pitches","users"];
await client.query(`drop trigger if exists audit_log_no_update on audit_log; drop trigger if exists audit_log_no_truncate on audit_log;`).catch(() => {});
for (const t of tables) {
  await client.query(`do $$ begin if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='${t}') then alter publication supabase_realtime drop table ${t}; end if; end $$;`).catch(() => {});
  await client.query(`drop table if exists ${t} cascade`);
}
const dir = "supabase/migrations";
for (const f of fs.readdirSync(dir).sort()) {
  console.log("apply", f);
  await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
}
console.log("seed");
await client.query(fs.readFileSync("supabase/seed.sql", "utf8"));
const { rows } = await client.query("select (select count(*) from pitches) p, (select count(*) from users) u, (select version from harness_configs where is_active) v");
console.log(rows[0]);
await client.end();
