import type { AssistantContext, Candidate, InterviewRound, Job, ParsedIntent, Stage } from "@/lib/types";

type CandidateHint = Pick<Candidate, "id" | "name" | "jobTitle">;
type JobHint = Pick<Job, "id" | "title">;
type DateSlot = { mentioned: boolean; value?: string };

const DAY_MS = 86_400_000;
const NUMERALS = "零〇一二两三四五六七八九十";
const actionKinds = new Set(["update_stage", "schedule_interview"]);

export function shanghaiToday(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validDate(year: number, month: number, day: number): string | undefined {
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return;
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shiftDate(date: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || !Number.isInteger(days) || !validDate(Number(match[1]), Number(match[2]), Number(match[3]))) return "";
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) + days * DAY_MS);
  return Number.isFinite(shifted.getTime()) ? shifted.toISOString().slice(0, 10) : "";
}

function readDate(message: string, today: string): DateSlot {
  const full = /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})(?:日|号)?(?!\d)/.exec(message);
  if (full) return { mentioned: true, value: validDate(Number(full[1]), Number(full[2]), Number(full[3])) };
  const partial = /(\d{1,2})月(\d{1,2})(?:日|号)?/.exec(message);
  if (partial) return { mentioned: true, value: validDate(Number(today.slice(0, 4)), Number(partial[1]), Number(partial[2])) };
  const relatives = [...message.matchAll(/大后天|后天|明天|明日|今天|今日|昨天|昨日|前天/g)];
  if (relatives.length) {
    if (/[或和及、]/.test(message) && new Set(relatives.map(item => item[0])).size > 1) return { mentioned: true };
    const offsets: Record<string, number> = { 大后天: 3, 后天: 2, 明天: 1, 明日: 1, 今天: 0, 今日: 0, 昨天: -1, 昨日: -1, 前天: -2 };
    return { mentioned: true, value: shiftDate(today, offsets[relatives.at(-1)![0]]) };
  }
  const week = /((?:下下|下|本|这)?)(?:周|星期|礼拜)([一二三四五六日天1-7])/.exec(message);
  if (week) {
    const weekdays: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
    const target = weekdays[week[2]] ?? Number(week[2]);
    const current = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
    let offset = target - current;
    if (week[1] === "下下") offset += 14;
    else if (week[1] === "下") offset += 7;
    else if (!week[1] && offset < 0) offset += 7;
    return { mentioned: true, value: shiftDate(today, offset) };
  }
  return { mentioned: /\d{4}[-/年]\d|\d+月|下周|本周|星期/.test(message) };
}

function numberValue(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return (tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0);
  }
  return digits[value] ?? Number.NaN;
}

function readTime(message: string): DateSlot {
  const clock = /(\d{1,2})[：:](\d{1,2})/.exec(message);
  const chinese = new RegExp(`(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里)?\\s*([${NUMERALS}\\d]{1,3})(?:点|时)(半|一刻|三刻|([${NUMERALS}\\d]{1,3})分?)?`).exec(message);
  if (!clock && !chinese) return { mentioned: /\d+[：:]\d|[零〇一二两三四五六七八九十\d]+[点时]|上午|下午|晚上|中午/.test(message) };
  let hour = clock ? Number(clock[1]) : numberValue(chinese![2]);
  const minute = clock ? Number(clock[2]) : chinese![3] === "半" ? 30 : chinese![3] === "一刻" ? 15 : chinese![3] === "三刻" ? 45 : chinese![4] ? numberValue(chinese![4]) : 0;
  const prefix = clock ? message.slice(Math.max(0, clock.index - 8), clock.index).match(/凌晨|早上|上午|中午|下午|傍晚|晚上|夜里/)?.[0] : chinese![1];
  if (prefix && (hour < 0 || hour > 12)) return { mentioned: true };
  if (/下午|傍晚|晚上|夜里/.test(prefix ?? "") && hour === 0) return { mentioned: true };
  // "晚上十二点" crosses a calendar boundary; ask for an explicit date and 00:00.
  if (/晚上|夜里/.test(prefix ?? "") && hour === 12) return { mentioned: true };
  if (/下午|傍晚|晚上|夜里/.test(prefix ?? "") && hour < 12) hour += 12;
  if (prefix === "凌晨" && hour === 12) hour = 0;
  if (prefix === "中午" && hour >= 1 && hour <= 5) hour += 12;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return { mentioned: true };
  return { mentioned: true, value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

function readRound(message: string): InterviewRound | undefined {
  const rounds = [...message.matchAll(/一面|初面|复试|二面|终面|三面/g)];
  const last = rounds.at(-1)?.[0];
  if (last === "初面" || last === "一面") return "一面";
  if (last === "复试" || last === "二面") return "复试";
  if (last) return "终面";
}

function readStage(message: string): Stage | undefined {
  if (/^offer$/i.test(message)) return "Offer";
  if (/^(?:待)?(?:一面|初面)$/.test(message)) return "待一面";
  if (/^(?:待)?(?:复试|二面)$/.test(message)) return "待复试";
  if (/(?:尚未|还未|还没(?:有)?|暂未).{0,3}通过|(?:尚未|还未|还没(?:有)?|未|没(?:有)?)接受\s*offer|尚未入职|还没入职|未入职/i.test(message)) return;
  if (/不通过|未通过|没(?:有)?通过|未过|没过|淘汰|拒绝(?:了)?\s*offer|不接受\s*offer|不录用|未录用/i.test(message)) return "已淘汰";
  if (/已入职|已经入职|入职了|完成入职|正式入职|到岗了/.test(message)) return "已入职";
  if (/(接受|接收|确认|签署|签了|同意).{0,6}offer|offer.{0,6}(接受|接收|确认|签署|同意)|待入职/i.test(message)) return "待入职";
  if (/发放\s*offer|发\s*offer|发送\s*offer|推进.{0,3}offer|进入.{0,3}offer|(?:更新为|改成|改为|设为|调整为)\s*offer|offer\s*阶段|收到\s*offer|拿到\s*offer/i.test(message)) return "Offer";
  if (/待复试|(?:进入|推进|安排|转到|改成|改为).{0,3}(?:复试|二面)|(?:一面|初面).{0,5}(?:通过|过了)|通过.{0,5}(?:一面|初面)/.test(message)) return "待复试";
  if (/待一面|(?:进入|推进|安排|转到|改成|改为).{0,3}(?:一面|初面)|(?:简历|初筛).{0,5}(?:通过|过了)|通过.{0,5}(?:简历|初筛)/.test(message)) return "待一面";
  if (/简历筛选|(?:进入|回到|待|改为|改成)初筛/.test(message)) return "简历筛选";
}

const normalized = (text: string) => text.replace(/\s/g, "").toLowerCase();
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function readHints(message: string, candidates: CandidateHint[], jobs: JobHint[]) {
  const plain = normalized(message);
  const ids = candidates.filter(item => new RegExp(`(?:^|[^a-zA-Z0-9_-])${escaped(item.id)}(?=$|[^a-zA-Z0-9_-])`).test(message));
  const names = [...new Set(candidates.filter(item => item.name && plain.includes(normalized(item.name))).map(item => item.name))];
  const longestNames = names.filter(name => !names.some(other => other !== name && other.includes(name)));
  const titles = [...new Set([...jobs.map(item => item.title), ...candidates.map(item => item.jobTitle)])].filter(title => title && plain.includes(normalized(title)));
  const longestTitles = titles.filter(title => !titles.some(other => other !== title && normalized(other).includes(normalized(title))));
  return {
    candidateId: ids.length === 1 ? ids[0].id : undefined,
    candidateName: ids.length === 1 ? ids[0].name : longestNames.length === 1 ? longestNames[0] : undefined,
    jobTitle: longestTitles.length === 1 ? longestTitles[0] : ids.length === 1 ? ids[0].jobTitle : undefined,
    hasCandidate: ids.length > 0 || longestNames.length > 0,
    multipleCandidates: ids.length > 1 || longestNames.length > 1,
    hasJob: longestTitles.length > 0
  };
}

function readNamedSlot(message: string, label: string): string | undefined {
  const match = new RegExp(`${label}(?:是|为|[:：])?\\s*(.+?)(?=[，,。；;\\n]|(?:地点|面试官|时间)(?:是|为|[:：])|$)`).exec(message);
  const value = match?.[1]?.trim();
  if (value && value.length <= 60 && !/^(?:待定|不知道|不清楚|还没定|暂无)$/.test(value)) return value;
}

function queryKind(message: string, hints: ReturnType<typeof readHints>): ParsedIntent["kind"] {
  if (/操作|记录|日志/.test(message) && /最近|最新|操作记录|操作日志|历史/.test(message)) return "query_activity";
  if (/跟进|待办|待联系|要联系|需要联系/.test(message)) return "query_followups";
  if (hints.hasCandidate && /阶段|状态|进度|进展|到哪|怎么样|通过|接受|入职|淘汰|offer/i.test(message)) return "query_candidate";
  if (/面试|一面|初面|复试|二面|终面|三面|日程/.test(message)) return "query_interviews";
  if (hints.hasJob && /多少|几|人数|候选人|统计|分布|情况|进度/.test(message)) return "query_job";
  if (/岗位|职位/.test(message) && /多少|几|人数|候选人|分布/.test(message)) return "query_job";
  if (/候选人|招聘阶段/.test(message) && /阶段|状态|进度|到哪/.test(message)) return "query_candidate";
  if (hints.hasCandidate) return "query_candidate";
  return "unknown";
}

/** Local, bounded HR commands. Parsing only: the service validates and confirms writes. */
export function interpretMessage(
  message: string,
  candidates: CandidateHint[],
  jobs: JobHint[],
  now: Date,
  context?: AssistantContext | null
): ParsedIntent {
  const text = message.trim();
  if (!text || /取消|算了|不改了|不要|别(?:再)?|不用|无需|不需要|不必|不想|不打算|先不|暂(?:时)?不|不安排|不更新|不推进|不操作|不是/.test(text)) return { kind: "unknown" };

  const hints = readHints(text, candidates, jobs);
  const date = readDate(text, shanghaiToday(now));
  const time = readTime(text);
  const round = readRound(text);
  const stage = readStage(text);
  const interviewer = readNamedSlot(text, "面试官");
  const location = readNamedSlot(text, "(?:地点|位置)");
  const count = new RegExp(`(?:最近|最新|前|查看|显示)\\s*([${NUMERALS}\\d]{1,3})\\s*(?:条|个|位|场)`).exec(text);
  const limit = count ? Math.max(1, Math.min(10, numberValue(count[1]))) : undefined;
  const slots: Omit<ParsedIntent, "kind"> = {};
  if (hints.hasCandidate) {
    slots.candidateName = hints.candidateName;
    slots.candidateId = hints.candidateId;
  }
  if (hints.hasJob || hints.candidateId) slots.jobTitle = hints.jobTitle;
  if (date.mentioned) slots.date = date.value;
  if (time.mentioned) slots.time = time.value;
  if (round) slots.round = round;
  if (/面试官/.test(text)) slots.interviewer = interviewer;
  if (/地点|位置/.test(text)) slots.location = location;
  if (limit && Number.isFinite(limit)) slots.limit = limit;

  const question = /[？?]|查询|查看|查一下|查查|(?:^|请|帮我|给我)查|看看|显示|列出|告诉我|有哪些|有谁|多少|几位|几场|什么|几点|何时|是否|有没有|会不会|能不能|能否|可不可以|怎么|如何|(?:吗|么|呢)[。!！]?$|现在.*(?:阶段|状态|进度)/.test(text);
  if (question) return { kind: queryKind(text, hints), ...slots };

  const scheduling = /安排|预约|创建|新增|设置|约个|约一下|约在/.test(text) && /面试|一面|初面|复试|二面|终面|三面/.test(text);
  const datedRound = Boolean(round && date.value && (time.value || hints.hasCandidate));
  if (scheduling) return { kind: "schedule_interview", ...slots, round };
  if (stage && context?.intent.kind === "update_stage" && context.missing.includes("stage") && !hints.hasCandidate) {
    return { ...context.intent, ...slots, stage };
  }
  const updateCommand = /更新|推进|改为|改成|调整为|调整到|进入/.test(text) && /阶段|状态|筛选|一面|初面|复试|二面|offer|入职|淘汰/i.test(text);
  const stageFact = /通过|过了|接受|拒绝|淘汰|入职了|已入职|发.{0,2}offer/i.test(text);
  if (updateCommand || (stage && (hints.hasCandidate || stageFact)) || (stageFact && hints.hasCandidate)) return { kind: "update_stage", ...slots, stage };

  // A short answer may fill a pending slot; explicit new intents were handled above.
  const previous = context?.intent;
  const previousIsKnown = !previous?.candidateId || candidates.some(item => item.id === previous.candidateId);
  const plainInterviewQuery = /面试|日程/.test(text) && date.mentioned && !time.mentioned && !round;
  if (plainInterviewQuery) return { kind: "query_interviews", ...slots };
  const plainQuery = queryKind(text, hints);
  if (plainQuery !== "unknown" && /跟进|待办|操作|日志|最近|人数|阶段|状态|进度|进展/.test(text)) return { kind: plainQuery, ...slots };
  const missing = context?.missing ?? [];
  const fillsPending = (missing.includes("candidate") && (hints.hasCandidate ||
    Boolean(previous?.candidateName && !previous.candidateId && hints.hasJob))) ||
    (missing.includes("job") && hints.hasJob) || (missing.includes("date") && date.mentioned) ||
    (missing.includes("time") && time.mentioned) || (missing.includes("round") && Boolean(round)) ||
    (missing.includes("stage") && Boolean(stage));
  const actionSlot = Object.keys(slots).some(key => key !== "limit");
  if (previous && previousIsKnown && (fillsPending || (actionKinds.has(previous.kind) && actionSlot))) {
    const merged = { ...previous, ...slots };
    if (stage && previous.kind === "update_stage") merged.stage = stage;
    if (merged.candidateName && !candidates.some(item => item.name === merged.candidateName)) delete merged.candidateName;
    if (merged.jobTitle && !jobs.some(item => item.title === merged.jobTitle) && !candidates.some(item => item.jobTitle === merged.jobTitle)) delete merged.jobTitle;
    if (hints.multipleCandidates) {
      delete merged.candidateId;
      delete merged.candidateName;
    }
    return merged;
  }

  if (datedRound) return { kind: "schedule_interview", ...slots, round };
  if (stage) return { kind: "update_stage", ...slots, stage };

  const fallbackQuery = queryKind(text, hints);
  if (fallbackQuery !== "unknown" && /面试|日程|跟进|待办|最近|操作|阶段|状态|人数|候选人|进度|进展/.test(text)) return { kind: fallbackQuery, ...slots };
  return { kind: "unknown" };
}
