import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaOnly = process.argv.includes("--schema-only");
for (const name of [".env.local", ".env"]) {
  const filename = path.join(root, name);
  if (existsSync(filename)) loadEnvFile(filename);
}

if (!process.env.DATABASE_URL) {
  console.error("请复制 .env.example 为 .env.local，填写 PostgreSQL 的 DATABASE_URL 后再初始化。");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000, max: 1 });
let client;
try {
  client = await pool.connect();
  await client.query("BEGIN");
  await client.query(readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
  if (!schemaOnly) await client.query(readFileSync(path.join(root, "db", "seed.sql"), "utf8"));
  await client.query("COMMIT");
  console.log(schemaOnly ? "PostgreSQL 表结构已更新，未写入演示资料。" : "PostgreSQL 表结构与虚构演示资料已初始化。重复运行不会覆盖已有业务资料。");
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => {});
  console.error("数据库初始化未完成：", error instanceof Error ? error.message : "未知错误");
  console.error(`请确认数据库已启动、连接配置有效，然后重新运行 pnpm db:${schemaOnly ? "migrate" : "init"}。`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
