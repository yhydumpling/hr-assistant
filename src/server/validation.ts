import type { ResumeFields } from "@/lib/types";
import { HttpError } from "@/server/errors";

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "请求内容必须是对象。");
  return value as Record<string, unknown>;
}

export function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string") {
    if (!required && (value === undefined || value === null)) return "";
    throw new HttpError(400, `请填写有效的${label}。`);
  }
  const result = value.trim();
  if ((required && !result) || result.length > max || result.includes("\0")) throw new HttpError(400, `${label}${required ? "不能为空，且" : ""}不能超过 ${max} 字。`);
  return result;
}

export function validId(value: unknown, label = "记录 ID"): string {
  const result = text(value, label, 120, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new HttpError(400, `${label}格式无效。`);
  return result;
}

export function validateFields(value: unknown): ResumeFields {
  const input = record(value);
  if (!Array.isArray(input.skills) || input.skills.length > 40) throw new HttpError(400, "技能须为不超过 40 项的列表。");
  const years = input.yearsOfExperience;
  if (years !== null && (typeof years !== "number" || !Number.isFinite(years) || years < 0 || years > 80)) throw new HttpError(400, "工作年限须为 0—80 之间的数值，未知时留空。");
  const fields: ResumeFields = {
    name: text(input.name, "姓名", 60, true), phone: text(input.phone, "电话", 40),
    email: text(input.email, "邮箱", 150), city: text(input.city, "城市", 80),
    education: text(input.education, "学历", 200), currentTitle: text(input.currentTitle, "当前职位", 120),
    yearsOfExperience: years as number | null,
    skills: [...new Set(input.skills.map(item => text(item, "技能", 80, true)))],
  };
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new HttpError(400, "请填写有效邮箱，或清空待核实内容。");
  return fields;
}
