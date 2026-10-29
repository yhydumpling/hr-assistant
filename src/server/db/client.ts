import { Pool, type PoolClient } from "pg";
import { HttpError } from "@/server/errors";

export type DatabaseRow = Record<string, unknown>;
type Row = DatabaseRow;
const globalDb = globalThis as typeof globalThis & { tsinPortfolioPool?: Pool };

function database(): Pool {
  if (globalDb.tsinPortfolioPool) return globalDb.tsinPortfolioPool;
  if (!process.env.DATABASE_URL?.trim()) throw new HttpError(503, "尚未配置 PostgreSQL。请复制 .env.example、配置 DATABASE_URL，并运行 pnpm db:init 初始化数据库。");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  pool.on("error", error => console.error("PostgreSQL idle connection error:", error.message));
  globalDb.tsinPortfolioPool = pool;
  return pool;
}

function databaseError(error: unknown): Error {
  if (error instanceof HttpError) return error;
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "28P01", "3D000", "57P03"].includes(code)) return new HttpError(503, "无法连接 PostgreSQL，请检查 DATABASE_URL 和数据库服务，再运行 pnpm db:init。");
  if (code === "42P01") return new HttpError(503, "PostgreSQL 表尚未初始化，请先运行 pnpm db:init。");
  if (code === "42703") return new HttpError(503, "PostgreSQL 表结构需要更新，请运行 pnpm db:migrate 后重试。");
  if (code === "23505") return new HttpError(409, "记录发生重复冲突，请刷新后重试。");
  return error instanceof Error ? error : new Error("Database request failed");
}

export async function query(sql: string, values: unknown[] = [], client?: PoolClient) {
  try { return client ? await client.query<Row>(sql, values) : await database().query<Row>(sql, values); }
  catch (error) { throw databaseError(error); }
}

export async function transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient;
  try { client = await database().connect(); }
  catch (error) { throw databaseError(error); }
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve the original transaction error. */ }
    throw databaseError(error);
  } finally { client.release(); }
}
