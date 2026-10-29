import type { ResumeFields } from "@/lib/types";
import { HttpError } from "@/server/errors";
import { RESUME_FIELD_DEFINITIONS, RESUME_FIELD_KEYS } from "@/lib/resume-schema";
import { normalizeSkillName } from "@/lib/resume-skills";

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
  if (Object.keys(input).some(key => !RESUME_FIELD_KEYS.includes(key as keyof ResumeFields))) throw new HttpError(400, "简历字段包含未定义的属性，请重新解析并核对。");
  if (RESUME_FIELD_KEYS.some(key => !(key in input))) throw new HttpError(400, "简历字段不完整，请重新解析并核对。");
  if (!Array.isArray(input.skills) || input.skills.length > 40) throw new HttpError(400, "技能须为不超过 40 项的列表。");
  const years = input.yearsOfExperience;
  if (years !== null && (typeof years !== "number" || !Number.isFinite(years) || years < 0 || years > 80)) throw new HttpError(400, "工作年限须为 0—80 之间的数值，未知时留空。");
  const stringField = (key: Exclude<keyof ResumeFields, "skills" | "yearsOfExperience">) => {
    const definition = RESUME_FIELD_DEFINITIONS[key];
    if (typeof input[key] !== "string") throw new HttpError(400, `${definition.label}须为文字，未知时留空。`);
    return text(input[key], definition.label, definition.maxLength, key === "name");
  };
  const fields: ResumeFields = {
    name: stringField("name"), phone: stringField("phone"),
    email: stringField("email"), city: stringField("city"),
    education: stringField("education"), currentTitle: stringField("currentTitle"),
    yearsOfExperience: years as number | null,
    skills: [...new Map(input.skills.map(item => { const skill = normalizeSkillName(text(item, "技能", RESUME_FIELD_DEFINITIONS.skills.maxLength, true)); return [skill.toLowerCase(), skill] as const; })).values()],
  };
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new HttpError(400, "请填写有效邮箱，或清空待核实内容。");
  return fields;
}
