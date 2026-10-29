/** Shared extraction contract. Empty strings/null/[] mean unknown, never inferred facts. */
export type ResumeFields = {
  name: string;
  phone: string;
  email: string;
  city: string;
  education: string;
  currentTitle: string;
  yearsOfExperience: number | null;
  skills: string[];
};

export const RESUME_SCHEMA_VERSION = "1.0" as const;
export type ResumeFieldKey = keyof ResumeFields;
type FieldDefinition = { label: string; description: string; aliases: readonly string[]; maxLength: number };

export const RESUME_FIELD_DEFINITIONS = {
  name: { label: "姓名", description: "候选人姓名；不使用推荐人、联系人或文件名替代。", aliases: ["姓名", "候选人", "Name", "Full Name"], maxLength: 60 },
  phone: { label: "联系电话", description: "候选人联系电话；保留国家区号，多个不同号码需要核对。", aliases: ["联系电话", "手机号码", "手机", "电话", "联系方式", "Mobile", "Phone", "Phone Number", "Telephone", "Tel"], maxLength: 40 },
  email: { label: "邮箱", description: "候选人电子邮箱；多个不同邮箱需要核对。", aliases: ["电子邮箱", "电子邮件", "邮箱", "E-mail", "Email"], maxLength: 150 },
  city: { label: "现居城市", description: "当前居住城市，不以籍贯、学校所在地或意向城市替代。", aliases: ["所在城市", "现居城市", "现居地", "现居", "所在地", "居住地", "城市", "Current Location", "Present Location", "Location", "Based in", "City"], maxLength: 80 },
  education: { label: "最高教育层次", description: "简历明确记载的最高教育层次；在读、预计毕业、肄业等状态一并保留，不等同已获学位。", aliases: ["最高学历", "学历", "最高学位", "教育背景", "教育经历", "Degree", "Education"], maxLength: 200 },
  currentTitle: { label: "当前职位", description: "明确标注的现任职位，不以求职意向或已经结束的经历替代。", aliases: ["现任职位", "目前职位", "当前职位", "现任岗位", "Current Title", "Current Role", "Current Position"], maxLength: 120 },
  yearsOfExperience: { label: "工作年限", description: "明确陈述的累计工作年数；不以年龄、毕业时间、实习或项目跨度推算。", aliases: ["工作经验", "工作年限", "从业年限", "相关经验", "Years of Experience", "Work Experience", "Experience"], maxLength: 20 },
  skills: { label: "技能", description: "明确提及的技能名称；同义写法归一，否定和计划学习不计作已有技能。", aliases: ["专业技能", "核心技能", "技术栈", "技能", "Skills", "Technical Skills", "Tech Stack"], maxLength: 80 },
} as const satisfies Record<ResumeFieldKey, FieldDefinition>;

export const RESUME_FIELD_KEYS = Object.keys(RESUME_FIELD_DEFINITIONS) as ResumeFieldKey[];

/** JSON Schema describes the normalized payload; validation also checks email and unique skills. */
export const RESUME_FIELDS_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ResumeFields",
  type: "object",
  additionalProperties: false,
  required: RESUME_FIELD_KEYS,
  properties: Object.fromEntries(RESUME_FIELD_KEYS.map(key => [key, {
    description: RESUME_FIELD_DEFINITIONS[key].description,
    ...(key === "yearsOfExperience" ? { type: ["number", "null"], minimum: 0, maximum: 80 }
      : key === "skills" ? { type: "array", maxItems: 40, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 80 } }
      : { type: "string", maxLength: RESUME_FIELD_DEFINITIONS[key].maxLength }),
  }])),
} as const;

export type ResumeFieldResult = {
  status: "found" | "review" | "missing";
  method: "label" | "pattern" | "section" | "header" | "none";
  /** Line numbers refer to normalizedText, not visual rows in the original document. */
  evidence: { line: number; text: string }[];
  candidates: string[];
  note: string;
};

export type ResumeSource = {
  format: "pdf" | "docx" | "txt" | "text";
  method: "pdf-text" | "docx-text" | "text-decoder" | "pasted-text";
  encoding?: "UTF-8" | "UTF-16LE" | "UTF-16BE" | "GB18030";
  pageCount?: number;
};

export type ResumeParseDetails = {
  schemaVersion: typeof RESUME_SCHEMA_VERSION;
  source: ResumeSource;
  normalizedText: string;
  fieldResults: Record<ResumeFieldKey, ResumeFieldResult>;
  warnings: string[];
};

export type ResumeReview = ResumeParseDetails & {
  extractedFields: ResumeFields;
  correctedFields: ResumeFieldKey[];
};
