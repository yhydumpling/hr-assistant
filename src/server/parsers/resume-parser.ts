import { RESUME_FIELD_DEFINITIONS, RESUME_FIELD_KEYS, type ResumeFieldKey, type ResumeFieldResult, type ResumeFields } from "@/lib/resume-schema";
import { findKnownSkills, normalizeSkillName } from "@/lib/resume-skills";

type Method = ResumeFieldResult["method"];
type Match = { value: string; line: number; method: Method; review?: boolean; note?: string };
type Section = "profile" | "education" | "work" | "projects" | "skills" | "target" | "references" | "requirements" | "other";
type LabelValue = { key: ResumeFieldKey; value: string; line: number; alias: string };
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clean = (value: string) => value.replace(/^[\s:|;,\-]+|[\s|;,]+$/g, "").trim();
const labelEntries = RESUME_FIELD_KEYS.flatMap(key => RESUME_FIELD_DEFINITIONS[key].aliases.map(alias => ({ key, alias })));
const labelKeys = new Map(labelEntries.map(({ key, alias }) => [alias.toLowerCase(), key]));
// These labels terminate a value but deliberately do not become candidate fields.
const stopLabels = ["年龄", "性别", "籍贯", "户籍", "民族", "政治面貌", "婚姻状况", "出生日期", "毕业时间", "毕业院校", "学校", "专业", "求职意向", "期望职位", "期望岗位", "意向职位", "意向岗位", "意向城市", "意向", "应聘岗位", "应聘职位", "期望薪资", "薪资", "Age", "Gender", "Nationality", "Date of Birth", "DOB", "Desired City", "Preferred City", "Desired Position", "Position Applied For", "Expected Salary", "Referee", "Reference"];
const labelPattern = [...labelEntries.map(({ alias }) => alias), ...stopLabels].map(alias => escape(alias).replace(/ /g, "[ \\t]+")).sort((a, b) => b.length - a.length).join("|");
const labelRegex = () => new RegExp(`(?<![a-zA-Z])(${labelPattern})(?:[ \\t]*:[ \\t]*|[ \\t]+(?=\\S)|$)`, "gi");
const requirement = /(?:招聘要求|任职要求|岗位要求|学历要求|要求.{0,6}(?:本科|硕士|博士)|(?:bachelor|master).{0,15}(?:required|preferred)|requirements?\s*:)/i;
const otherPerson = /(?:紧急联系人|推荐人|推荐老师|证明人|referee|references?\s*:)/i;

function normalizeText(text: string): string {
  return text.normalize("NFKC").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\f/g, "\n")
    .replace(/[\u200B-\u200D\u2060]/g, "").replace(/[\u00A0\u3000]/g, " ")
    .split("\n").map(line => line.replace(/[\t ]+/g, " ").trim()).join("\n").trim();
}

function heading(line: string): Section | null {
  const value = line.replace(/^[#*\s\d一二三四五六七八九十、.()\-]+/, "").replace(/[:\s*#]+$/, "").toLowerCase();
  if (/^(?:要求|任职要求|岗位要求|招聘要求|招聘条件|岗位职责|requirements?|job requirements?|qualifications?)\s*:/.test(value)) return "requirements";
  if (/^(?:教育(?:背景|经历)|学历(?:背景|信息)?|education(?:al background)?|academic (?:background|qualifications?))$/.test(value)) return "education";
  if (/^(?:工作(?:经历|经验)|职业经历|任职经历|实习(?:经历|经验)|work experience|employment(?: history)?|professional experience|internships?)$/.test(value)) return "work";
  if (/^(?:项目(?:经历|经验)|projects?|project experience)$/.test(value)) return "projects";
  if (/^(?:专业技能|核心技能|技能(?:清单|特长)?|技术栈|skills|technical skills|tech stack)$/.test(value)) return "skills";
  if (/^(?:求职意向|意向职位|职业目标|objective|career objective|desired position)$/.test(value)) return "target";
  if (/^(?:推荐人|证明人|references?|referees?)$/.test(value)) return "references";
  if (/^(?:要求|任职要求|岗位要求|招聘要求|招聘条件|岗位职责|requirements?|job requirements?|qualifications?)$/.test(value)) return "requirements";
  if (/^(?:基本信息|个人信息|联系方式|personal (?:details|information)|contact(?: details)?)$/.test(value)) return "profile";
  if (/^(?:自我评价|个人总结|荣誉奖项|兴趣爱好|summary|profile|awards?|interests?)$/.test(value)) return "other";
  return null;
}

function collectLabels(lines: string[]): LabelValue[] {
  const values: LabelValue[] = [];
  lines.forEach((line, index) => {
    const matches = [...line.matchAll(labelRegex())];
    matches.forEach((match, position) => {
      const key = labelKeys.get(match[1].replace(/\s+/g, " ").toLowerCase());
      if (!key) return;
      // A suffix such as “意向城市” or “推荐人姓名” is not the candidate's own field.
      const prefix = line.slice(Math.max(0, match.index! - 12), match.index);
      if (key === "city" && /(?:意向|期望|目标|籍贯|户籍|出生|希望|工作)\S{0,4}$|(?:desired|preferred|target|hometown|birth)\s*$/i.test(prefix)) return;
      if (key === "name" && /(?:联系人|推荐人|面试官|父亲|母亲)\S{0,3}$|(?:referee|reference|contact)\s*$/i.test(prefix)) return;
      let value = clean(line.slice(match.index! + match[0].length, matches[position + 1]?.index ?? line.length));
      let valueLine = index + 1;
      if (!value && position === matches.length - 1) {
        const next = lines.findIndex((item, nextIndex) => nextIndex > index && Boolean(item));
        if (next >= 0 && next <= index + 2 && !heading(lines[next]) && !labelRegex().test(lines[next])) {
          value = clean(lines[next]); valueLine = next + 1;
        }
      }
      if (value) values.push({ key, value, line: valueLine, alias: match[1].replace(/\s+/g, " ") });
    });
  });
  return values;
}

const degrees: { pattern: RegExp; label: string; rank: number }[] = [
  { pattern: /博士|ph\.?\s*d\.?|doctorate|doctor of philosophy/i, label: "博士", rank: 7 },
  { pattern: /硕士|master(?:'s)?(?: degree)?|m\.?\s*sc\.?|m\.?\s*eng\.?|m\.?\s*b\.?\s*a\.?/i, label: "硕士", rank: 6 },
  { pattern: /研究生|postgraduate/i, label: "研究生", rank: 5 },
  { pattern: /本科|学士|bachelor(?:'s)?(?: degree)?|b\.?\s*sc\.?|b\.?\s*eng\.?/i, label: "本科", rank: 4 },
  { pattern: /大专|专科|associate(?:'s)?(?: degree)?/i, label: "大专", rank: 3 },
  { pattern: /中专|职高|职业高中/i, label: "中专", rank: 2 },
  { pattern: /高中|high school/i, label: "高中", rank: 1 },
];

function educationFrom(value: string): { value: string; rank: number } | null {
  const degree = degrees.find(item => item.pattern.test(value));
  if (!degree || /(?:研究生|硕士|博士)课程|课程(?:名称)?\s*:|培训课程|考研(?:目标|计划)|计划攻读|拟攻读|希望攻读/i.test(value)) return null;
  const status = /肄业|未毕业|drop(?:ped)?\s*out|incomplete/i.test(value) ? "肄业 / 未完成"
    : /(?:预计|预期|预定|计划).{0,20}毕业|expected.{0,25}(?:graduation|graduat)|graduat\w*.{0,20}(?:expected|anticipated)/i.test(value) ? "预计毕业"
    : /在读|就读|攻读|在学|目前在|currently (?:studying|pursuing|enrolled)|in progress|pursuing|candidate for/i.test(value) ? "在读" : "";
  return { value: status ? `${degree.label}（${status}）` : degree.label, rank: degree.rank };
}

function canonicalPhone(value: string): string | null {
  const compact = value.replace(/[\s()\-]/g, "");
  if (/^1[3-9]\d{9}$/.test(compact)) return compact;
  if (/^(?:\+?86)1[3-9]\d{9}$/.test(compact)) return `+${compact.replace(/^\+/, "")}`;
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

const chineseNumbers: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function yearsNumber(value: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value in chineseNumbers) return chineseNumbers[value];
  const match = value.match(/^([一二三四五六七八九]?)十([一二三四五六七八九]?)$/);
  return match ? (chineseNumbers[match[1]] || 1) * 10 + (chineseNumbers[match[2]] || 0) : null;
}

function isNegativeMention(line: string, index: number, length: number): boolean {
  const before = line.slice(0, index).split(/[,，;；。!！|]|但是|不过|但/).at(-1) || "";
  const after = line.slice(index + length).split(/[,，;；。!！|]/)[0];
  return /不(?:会|懂|熟悉|掌握|擅长|了解|具备|使用)|未(?:曾)?(?:接触|使用|学习|掌握)|尚未|没有|缺乏|待学习|计划|准备学习|希望学习|打算学习|将学习|want to learn|plan(?:ning)? to|not (?:familiar|proficient)|no experience|never (?:used|learned)|without experience/i.test(before)
    || /\b(?:no|without)\s+(?:\w+\s+){0,3}$/i.test(before)
    || /^(?:\s*(?:尚未|并不|不|未).{0,4}(?:熟悉|掌握|使用|了解)|\s*(?:暂无|无)经验|\s*(?:尚待学习|待学习)|[\s:()]*no\s+(?:\w+\s+){0,2}experience)/i.test(after);
}

function plausibleName(value: string): boolean {
  if (value.length > 60 || /简历|信息|背景|经历|教育|技能|工作|个人|职位|求职|自我|联系|大学|学院|公司|研究所|工程师|应届|毕业|本科|硕士|博士|resume|curriculum vitae|profile|education|experience|skills|contact|university|college|engineer|developer|designer|manager/i.test(value)) return false;
  return /^[\p{Script=Han}·•]{2,12}$/u.test(value) || /^[A-Za-z][A-Za-z .'-]{1,58}[A-Za-z]$/.test(value);
}

const normalizeName = (value: string) => /^[\p{Script=Han}·•\s]+$/u.test(value) ? value.replace(/\s+/g, "") : value;

export function parseResumeText(rawText: string): { fields: ResumeFields; normalizedText: string; fieldResults: Record<ResumeFieldKey, ResumeFieldResult>; warnings: string[] } {
  const normalizedText = normalizeText(rawText);
  const lines = normalizedText.split("\n");
  const labels = collectLabels(lines);
  const labelsByLine = new Map<number, LabelValue[]>();
  for (const label of labels) labelsByLine.set(label.line, [...(labelsByLine.get(label.line) || []), label]);
  const matches = Object.fromEntries(RESUME_FIELD_KEYS.map(key => [key, [] as Match[]])) as Record<ResumeFieldKey, Match[]>;
  const warnings: string[] = [];
  let activeSection: Section = "profile";
  const sections = lines.map(line => {
    const next = heading(line);
    // Treat headings inside an embedded JD as requirements until personal details resume.
    if (activeSection !== "requirements" || next === "profile") activeSection = next || activeSection;
    return activeSection;
  });
  const usable = (index: number) => !["references", "target", "requirements"].includes(sections[index]) && !otherPerson.test(lines[index]) && !requirement.test(lines[index]);
  const add = (key: ResumeFieldKey, value: string, line: number, method: Method, review = false, note?: string) => {
    if (value && value.length <= RESUME_FIELD_DEFINITIONS[key].maxLength) matches[key].push({ value, line, method, review, note });
  };

  for (const label of labels) {
    const { key, value, line, alias } = label;
    if (!usable(line - 1)) continue;
    if (key === "name") { const name = normalizeName(value); if (plausibleName(name)) add(key, name, line, "label"); }
    else if (key === "city") {
      const explicitResidence = /现居|居住|^(?:Current Location|Present Location|Based in)$/i.test(alias);
      if (!explicitResidence && sections[line - 1] !== "profile") continue;
      const residence = value.split(/[,;|]/)[0].trim();
      if (!/籍贯|户籍|意向|期望|希望|目标/.test(residence) && residence.length <= 80) add(key, residence, line, "label");
    } else if (key === "currentTitle") {
      if (!/求职|意向|期望|目标|希望|申请|desired|seeking|looking for/i.test(value)) add(key, value, line, "label");
    }
  }

  // Unlabelled names are suggestions from the document header, never certain identities.
  if (!matches.name.length) {
    const headerIndex = lines.findIndex(line => Boolean(line) && !heading(line) && !/^(?:个人简历|简历|resume|curriculum vitae)$/i.test(line));
    if (headerIndex >= 0 && headerIndex < 5 && usable(headerIndex)) {
      const header = normalizeName(lines[headerIndex].split(/[|,;]/)[0].trim());
      if (plausibleName(header)) add("name", header, headerIndex + 1, "header", true, "从简历页首推测姓名，请核对是否为候选人本人。");
    }
  }

  const education: (Match & { rank: number })[] = [];
  lines.forEach((line, index) => {
    if (!usable(index)) return;
    const number = index + 1;
    const labelValues = labelsByLine.get(number) || [];
    // Short Chinese residence statements do not need a colon: “现居上海，意向北京”.
    for (const match of line.matchAll(/(?:^|[ ,;|])(?:目前)?(?:现居(?:住)?(?:于)?|居住于|定居(?:于)?)[ :]*([\p{Script=Han}]{2,12})(?=[ ,;|]|$)/gu)) {
      const value = match[1];
      if (!/籍贯|户籍|意向|期望|希望|目标/.test(value)) add("city", value, number, "pattern");
    }
    const phoneValues = labelValues.filter(label => label.key === "phone");
    const emailValues = labelValues.filter(label => label.key === "email");
    const scanContacts = sections[index] === "profile" || phoneValues.length > 0 || emailValues.length > 0 || index < 8;
    if (scanContacts) {
      for (const match of line.matchAll(/(?<![\da-zA-Z])(?:(?:\+?86[ -]?)?1[3-9](?:[ -]?\d){9}|\+[1-9][\d ()-]{7,24}\d)(?!\d)/gi)) {
        const value = canonicalPhone(match[0]);
        if (value) add("phone", value, number, phoneValues.length ? "label" : "pattern");
      }
      for (const match of line.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)) add("email", match[0], number, emailValues.length ? "label" : "pattern");
      // Domestic landlines are considered only under an explicit phone label.
      for (const label of phoneValues) for (const match of label.value.matchAll(/(?<!\d)(0\d{2,3})[ -](\d{7,8})(?!\d)/g)) add("phone", `${match[1]}-${match[2]}`, number, "label");
    }

    const educationLabels = labelValues.filter(label => label.key === "education");
    const isEducation = sections[index] === "education" || educationLabels.length > 0
      || (!["work", "projects", "skills"].includes(sections[index]) && /大学|学院|\buniversity\b|\bcollege\b/i.test(line));
    if (isEducation && !heading(line)) {
      const values = educationLabels.length ? educationLabels.map(label => label.value) : [line];
      for (const value of values) {
        if (!educationLabels.length && /课程|培训|管理系统|管理平台|面向|软件产品/.test(value)) continue;
        const nextLine = lines[index + 1] || "";
        const usesNextLine = Boolean(nextLine && !heading(nextLine) && !degrees.some(degree => degree.pattern.test(nextLine)) && /在读|预计.{0,20}毕业|expected|in progress/i.test(nextLine));
        const context = usesNextLine ? `${value} ${nextLine}` : value;
        const parsed = educationFrom(context);
        if (parsed) {
          const method = educationLabels.length ? "label" : "section";
          education.push({ ...parsed, line: number, method });
          if (usesNextLine) education.push({ ...parsed, line: number + 1, method });
        }
      }
    }

    // Only a stated total is accepted; dates, internships and project durations are not added up.
    const yearLabels = labelValues.filter(label => label.key === "yearsOfExperience");
    const amountPattern = "(?<!\\d)(?:\\d{1,2}(?:\\.\\d+)?|[零一二两三四五六七八九十]{1,3})\\s*(?:\\+\\s*)?(?:[-–—~至到]\\s*(?:\\d{1,2}(?:\\.\\d+)?|[零一二两三四五六七八九十]{1,3})\\s*)?(?:年|years?)(?:半)?\\s*(?:以上|以下|左右|余|多|\\+)?";
    // Bind the quantity to its work-experience phrase instead of selecting the first
    // year in a line that may also contain graduation dates or study durations.
    const workQuantity = new RegExp(`(?:(?:over|more than|at least|about|approximately|around)\\s+)?${amountPattern}\\s*(?:(?:工作|从业|相关)(?:经验)?|经验|(?:of\\s+)?(?:work\\s+)?experience)|(?:工作|从业)(?:已有|了|已)?\\s*${amountPattern}`, "gi");
    const inputs = yearLabels.length ? yearLabels.map(label => label.value) : [...line.matchAll(workQuantity)].map(match => match[0]);
    if (inputs.length && !/实习经验|实习年限|internship experience|实习.{0,4}\d+\s*年/i.test(line)) {
      for (const value of inputs) {
        const match = value.match(/(?<!\d)(\d{1,2}(?:\.\d+)?|[零一二两三四五六七八九十]{1,3})\s*(?:\+\s*)?(?:[-–—~至到]\s*(?:\d{1,2}(?:\.\d+)?|[零一二两三四五六七八九十]{1,3})\s*)?(?:年|years?)(?:半)?\s*(?:以上|以下|左右|余|多|\+)?/i);
        if (!match) continue;
        let numeric = yearsNumber(match[1]);
        if (numeric !== null && /年半/.test(match[0])) numeric += 0.5;
        const uncertain = /[-–—~至到]|以上|以下|左右|余|多|\+/.test(match[0]) || /(?:over|more than|at least|about|approximately|around)\s*$/i.test(value.slice(0, match.index));
        if (numeric !== null && numeric >= 0 && numeric <= 80) add("yearsOfExperience", uncertain ? match[0].trim() : String(numeric), number, yearLabels.length ? "label" : "pattern", uncertain, uncertain ? "原文为范围或约数，请人工填写可确认的工作年限。" : undefined);
      }
    }

    if (/求职意向|意向(?:职位|岗位)|期望(?:职位|岗位)|目标(?:职位|岗位)|desired position|seeking|looking for/i.test(line)) return;
    const skillLabels = labelValues.filter(label => label.key === "skills");
    const explicitSkills = skillLabels.length > 0 || sections[index] === "skills";
    for (const skill of findKnownSkills(line)) {
      if (!isNegativeMention(line, skill.index, skill.raw.length)) add("skills", skill.name, number, skillLabels.length ? "label" : explicitSkills ? "section" : "pattern");
    }
    if (explicitSkills && !heading(line)) {
      const values = skillLabels.length ? skillLabels.map(label => label.value) : [line];
      for (const value of values) for (const tokenMatch of value.matchAll(/[^,，、;；|/]+/g)) {
        const token = tokenMatch[0];
        const skill = token.trim().replace(/^[-*•·]\s*/, "").replace(/^(?:精通|熟练(?:掌握|使用)?|掌握|熟悉|了解|使用|proficient in|familiar with)\s*/i, "").trim();
        const indexInLine = line.indexOf(value) + tokenMatch.index! + Math.max(0, token.indexOf(skill));
        if (skill && skill.length <= 80 && !isNegativeMention(line, indexInLine, skill.length)
          && (/^[a-zA-Z][a-zA-Z0-9+#. -]{0,60}$/.test(skill) || /^[\p{Script=Han}]{2,12}$/u.test(skill))
          && !/能力|经验|掌握|熟悉|了解|学习|沟通|团队|负责|进行|开发了|使用了|计划|尚未|不会|not |learning|experience|development/i.test(skill)) add("skills", normalizeSkillName(skill), number, skillLabels.length ? "label" : "section");
      }
    }
  });

  if (education.length) {
    const rank = Math.max(...education.map(item => item.rank));
    const highest = education.filter(item => item.rank === rank);
    const qualified = highest.filter(item => item.value.includes("（"));
    // An explicit study/completion status adds information to an otherwise identical degree.
    matches.education = qualified.length ? qualified : highest;
  }
  const fields: ResumeFields = { name: "", phone: "", email: "", city: "", education: "", currentTitle: "", yearsOfExperience: null, skills: [] };
  const fieldResults = {} as Record<ResumeFieldKey, ResumeFieldResult>;
  for (const key of RESUME_FIELD_KEYS) {
    const found = matches[key];
    const groups = new Map<string, Match>();
    for (const item of found) {
      // A domestic number and its +86 form identify the same contact.
      const identity = key === "phone" ? item.value.replace(/^\+86(?=1\d{10}$)/, "") : item.value.toLowerCase();
      if (!groups.has(identity)) groups.set(identity, item);
    }
    const unique = [...groups.values()];
    const conflict = key !== "skills" && unique.length > 1;
    const needsReview = conflict || unique.some(item => item.review);
    const evidence = [...new Set(found.map(item => item.line))].slice(0, 16).map(line => ({ line, text: lines[line - 1].slice(0, 400) }));
    fieldResults[key] = {
      status: !unique.length ? "missing" : needsReview ? "review" : "found",
      method: unique[0]?.method || "none", evidence, candidates: unique.map(item => item.value).slice(0, key === "skills" ? 40 : 12),
      note: conflict ? "原文出现多个不同候选值，已留空，请结合证据选择。" : unique[0]?.note || (!unique.length ? "未找到符合字段语义的明确内容，保留为空。" : key === "skills" ? "技能同义写法已归一；仅代表简历提及，不代表能力已验证。" : "按原文明确信息提取，保存前仍需核对。"),
    };
    if (key === "skills") fields.skills = unique.slice(0, 40).map(item => item.value);
    else if (!conflict && unique.length) {
      if (key === "yearsOfExperience") { if (!needsReview) fields.yearsOfExperience = Number(unique[0].value); }
      else fields[key] = unique[0].value;
    }
  }
  if (fieldResults.name.method === "header") warnings.push("姓名来自页首推测，请确认不是标题或其他人的姓名。");
  if (RESUME_FIELD_KEYS.some(key => fieldResults[key].status === "review")) warnings.push("存在需核对的字段；冲突或范围值不会替你作选择。");
  if (matches.skills.length > 40 && fields.skills.length === 40) warnings.push("技能最多保留 40 项，请检查是否有无关内容。");
  if (/\uFFFD/.test(normalizedText)) warnings.push("文本包含无法解码的字符，部分字段可能缺失，请检查原文或重新导出文件。");
  return { fields, normalizedText, fieldResults, warnings };
}
