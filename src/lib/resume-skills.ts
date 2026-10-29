/** Canonical names are shared by extraction and the job keyword comparison. */
export const SKILL_ALIASES: Record<string, readonly string[]> = {
  Java: ["java"],
  "Spring Boot": ["spring boot", "springboot"],
  MySQL: ["mysql"],
  Redis: ["redis"],
  Kafka: ["kafka"],
  Python: ["python", "python3"],
  FastAPI: ["fastapi", "fast api"],
  PostgreSQL: ["postgresql", "postgres", "postgre sql"],
  "Node.js": ["node.js", "nodejs", "node js"],
  React: ["react", "react.js", "reactjs"],
  TypeScript: ["typescript", "type script", "ts"],
  JavaScript: ["javascript", "java script", "js"],
  Vue: ["vue", "vue.js", "vuejs", "vue3"],
  "Next.js": ["next.js", "nextjs", "next js"],
  SQL: ["sql"],
  Docker: ["docker"],
  Git: ["git"],
  RAG: ["rag", "检索增强生成"],
  Agent: ["agent", "agents", "智能体"],
  Figma: ["figma"],
  Axure: ["axure"],
  "C++": ["c++"],
  "C#": ["c#"],
  Go: ["golang"],
  Linux: ["linux"],
  Excel: ["excel"],
  "数据分析": ["数据分析"],
  "需求分析": ["需求分析"],
  "项目管理": ["项目管理"],
  "用户研究": ["用户研究"],
};

const keyOf = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const aliases = new Map(Object.entries(SKILL_ALIASES).flatMap(([name, values]) => [name, ...values].map(value => [keyOf(value), name] as const)));

export function normalizeSkillName(value: string): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  // Short PG and Go are accepted only as whole explicit skill names, not found in prose.
  if (/^pg$/i.test(normalized)) return "PostgreSQL";
  if (/^go$/i.test(normalized)) return "Go";
  return aliases.get(keyOf(normalized)) || normalized;
}

export function hasCanonicalSkill(skills: string[], required: string): boolean {
  const requiredKey = keyOf(normalizeSkillName(required));
  return skills.some(skill => keyOf(normalizeSkillName(skill)) === requiredKey);
}

export function findKnownSkills(text: string): { name: string; index: number; raw: string }[] {
  const results: { name: string; index: number; raw: string }[] = [];
  const variants = [...new Set(Object.entries(SKILL_ALIASES).flatMap(([name, values]) => name === "Go" ? [...values] : [name, ...values]))].sort((a, b) => b.length - a.length);
  const escaped = variants.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(?<![a-zA-Z0-9_+#.])(?:${escaped})(?![a-zA-Z0-9_+#])`, "gi");
  for (const match of text.matchAll(pattern)) results.push({ name: normalizeSkillName(match[0]), index: match.index, raw: match[0] });
  return results;
}
