export const splitSkills = (value: string) => [...new Set(value.split(/[，,、\n]/).map(item => item.trim()).filter(Boolean))];

export function dateLabel(value?: string | null) {
  if (!value) return "未设置";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
  });
}
