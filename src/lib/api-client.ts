export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || body.message || `请求未完成（${response.status}）`, response.status);
  return body as T;
}

export const json = (value: unknown): RequestInit => ({
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value)
});

export const messageOf = (error: unknown) => error instanceof Error ? error.message : "操作未完成，请稍后重试。";
