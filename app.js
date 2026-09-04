const STORAGE_KEY = "xinyue-job-tracker-v1";
const STATUSES = [
  "已投递", "简历初筛通过", "简历挂",
  "待测评", "已测评", "测评通过", "测评挂",
  "待AI面", "AI面通过", "AI面挂", "业务面", "业务面通过", "业务面挂",
  "待一面", "一面通过", "一面挂", "待二面", "二面通过", "二面挂",
  "待终面", "终面通过", "终面挂", "待HR面", "HR面通过", "HR面挂",
  "已录用", "已放弃", "流程终止"
];
const DEADLINE_LABELS = {
  "待测评": "测评截止时间", "待AI面": "AI面时间", "待一面": "一面时间",
  "待二面": "二面时间", "待终面": "终面时间", "待HR面": "HR面时间", "业务面": "业务面时间"
};
const NEXT_STAGE = {
  "已投递": ["简历初筛通过", "待测评"], "简历初筛通过": ["待测评", "待AI面", "待一面"],
  "待测评": ["已测评"], "已测评": ["测评通过"], "测评通过": ["待AI面", "待一面"],
  "待AI面": ["AI面通过"], "AI面通过": ["待一面", "业务面"],
  "业务面": ["业务面通过"], "业务面通过": ["待一面", "待二面", "待HR面"],
  "待一面": ["一面通过"], "一面通过": ["待二面", "待终面"],
  "待二面": ["二面通过"], "二面通过": ["待终面", "待HR面"],
  "待终面": ["终面通过"], "终面通过": ["待HR面", "已录用"],
  "待HR面": ["HR面通过"], "HR面通过": ["已录用"]
};
const JOB_FIELDS = ["company", "role", "companyType", "city", "applicationDate", "status", "assessmentDeadline", "nextStage", "nextStageTime", "failReason", "channel", "preference", "receivedInterview", "jobUrl", "description", "interviewInfo", "applicationRule", "experienceSummary"];
const FIELD_RULES = [
  { when: (v) => DEADLINE_LABELS[v.status], require: ["assessmentDeadline"], msg: "当前进度需要填写节点时间" },
  { when: (v) => v.receivedInterview, require: ["interviewInfo"], msg: "已标记「收到面试」，请填写网上面试信息" },
  { when: (v) => /挂$/.test(v.status || ""), require: ["failReason"], msg: "请填写挂掉的原因" },
  { when: (v) => ["已放弃", "流程终止"].includes(v.status), require: ["failReason"], msg: "请填写终止原因" },
  { when: (v) => v.nextStage && DEADLINE_LABELS[v.nextStage], require: ["nextStageTime"], msg: "选择了下一节点，请填写对应时间" }
];
const LEGACY = { "已投": "已投递", "测评": "待测评", "AI面": "待AI面", "一面": "待一面", "二面": "待二面", "终面": "待终面", "HR面": "待HR面" };
const TITLES = { dashboard: "求职看板", applied: "投递记录", wishlist: "待投递清单", prep: "面试准备", aiconfig: "AI 配置" };
const AI_STORE = "xinyue-job-tracker-ai";
const PROVIDERS = [
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "zhipu", name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { id: "moonshot", name: "Moonshot Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { id: "qwen", name: "阿里百炼（通义）", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { id: "siliconflow", name: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-7B-Instruct" },
  { id: "custom", name: "自定义（OpenAI 兼容）", baseUrl: "", model: "" }
];
const PROMPTS = {
  experience: (c) => `你是资深校招面试官，擅长帮候选人打磨经历表述。\n请用 STAR 框架打磨下面这段经历，依次输出四段：情境(S) / 任务(T) / 行动(A) / 结果(R)，最后附一段 90 秒口述稿。\n\n主题：${c.topic}\n目标岗位：${c.role}\n岗位 JD：${c.jd}\n原始材料：${c.raw}\n\n要求：结果尽量量化；语言口语化、可直接朗读；正文 200-300 字。`,
  question: (c) => `你是资深校招面试官。请针对下面的岗位，列出 8 个高频面试问题。\n每个问题给出：①问题原文 ②一句话说明考察点 ③回答要点（不超过 3 条）。\n\n主题：${c.topic}\n目标岗位：${c.role}\n岗位 JD：${c.jd}\n我的背景材料：${c.raw}\n\n要求：问题要贴合该岗位真实的考察方向，不要泛泛而谈。`,
  self_intro: (c) => `你是资深校招面试官。请为应聘下面岗位写 3 版自我介绍，分别是 60 秒 / 90 秒 / 3 分钟。\n每版包含：开场定位、核心经历（1-2 段）、与岗位匹配的理由、收尾。\n\n主题：${c.topic}\n目标岗位：${c.role}\n岗位 JD：${c.jd}\n我的背景材料：${c.raw}\n\n要求：口语化、可直接朗读；突出与该岗位的匹配点。`
};
let state = { jobs: [], prep: [], page: "dashboard", search: "", filter: "全部状态", prepCategory: "experience", nextId: 1, range: "all", expanded: new Set() };
let composing = false, searchTimer;
const $ = (id) => document.getElementById(id);
const trim = (v) => typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const normalizeStatus = (s, bucket) => bucket === "wishlist" ? (s || "待投递") : (LEGACY[s] || (s === "待投递" ? "已投递" : s) || "已投递");

function dateText(value) {
  if (!value) return "—";
  const [day, time] = String(value).split("T");
  return `${day.slice(0, 10).replaceAll("-", ".")}${time ? ` ${time.slice(0, 5)}` : ""}`;
}
function dateTimeInput(value) { return !value ? "" : String(value).includes("T") ? String(value).slice(0, 16) : `${String(value).slice(0, 10)}T23:59`; }

function migrate(jobs) { return jobs.map((j) => ({ ...j, status: normalizeStatus(j.status, j.bucket), stageHistory: j.stageHistory ?? [] })); }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobs: state.jobs, prep: state.prep, nextId: state.nextId })); }
function notify(message) { const n = $("notice"); n.textContent = `✓ ${message}`; n.hidden = false; clearTimeout(notify.timer); notify.timer = setTimeout(() => { n.hidden = true; }, 2800); }
function tone(status) { if (status?.includes("挂") || ["流程终止", "已放弃"].includes(status)) return "danger"; if (status === "已录用" || status?.includes("通过") || status === "已测评") return "success"; if (status?.startsWith("待") || status?.includes("面")) return "warning"; return ""; }
function pill(status) { return `<span class="pill ${tone(status)}">${esc(status || "—")}</span>`; }
function empty(title, text, action = "") { return `<div class="empty"><span>—</span><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`; }
function card(title, subtitle, body, action = "", anim = -1) { return `<section class="card${anim >= 0 ? " rise" : ""}" style="--i:${Math.max(anim, 0)}"><header><div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>${action}</header>${body}</section>`; }
function stat(no, title, value, note, anim = -1) { return `<article class="stat${anim >= 0 ? " rise" : ""}" style="--i:${Math.max(anim, 0)}"><i>${no}</i><div><span>${title}</span><strong data-count="${value}">${value}</strong><small>${note}</small></div></article>`; }

function deadlineMeta(value) {
  if (!value) return { cls: "missing", label: "待填写" };
  const deadline = new Date(String(value).length === 10 ? `${value}T23:59:59` : value);
  const diff = deadline.getTime() - Date.now(), days = Math.ceil(diff / 86400000);
  if (diff < 0) return { cls: "overdue", label: "已逾期" };
  if (days <= 1) return { cls: "due-1", label: "1天内" };
  if (days <= 2) return { cls: "due-2", label: "2天内" };
  if (days <= 3) return { cls: "due-3", label: "3天内" };
  if (days <= 5) return { cls: "due-5", label: "5天内" };
  return { cls: "future", label: `${days}天后` };
}

const tsOf = (v) => (v ? new Date(String(v).length === 10 ? `${v}T00:00` : v).getTime() : null);
const tsText = (ts) => { const d = new Date(ts), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

function validateJob(v, existing) {
  const errors = FIELD_RULES.filter((r) => r.when(v)).flatMap((r) => r.require.filter((f) => !v[f]).map(() => r.msg));
  const history = existing?.stageHistory?.length ? existing.stageHistory : (v.stageHistory || []);
  const node = tsOf(v.assessmentDeadline), applied = tsOf(v.applicationDate);
  if (applied && node && node < applied) errors.push("节点时间不能早于投递日期");
  const prev = history.map((h) => tsOf(h.time)).filter(Boolean).sort((a, b) => b - a)[0];
  if (prev && node && node < prev) errors.push(`节点时间不能早于上一节点（${tsText(prev)}）`);
  const next = tsOf(v.nextStageTime);
  if (next && applied && next < applied) errors.push("下一节点时间不能早于投递日期");
  if (next && node && next < node) errors.push("下一节点时间不能早于当前节点时间");
  return [...new Set(errors)];
}

let animKey = "";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function render() {
  const scrollTop = window.scrollY;
  if (state.page !== "dashboard") animKey = "";
  $("pageTitle").textContent = TITLES[state.page];
  document.querySelectorAll("[data-page]").forEach((b) => b.classList.toggle("active", b.dataset.page === state.page));
  ({ dashboard: renderDashboard, applied: renderApplied, wishlist: renderWishlist, prep: renderPrep, aiconfig: renderAIConfig }[state.page])();
  window.scrollTo(0, scrollTop);
}

const RANGES = [["7d", "近 7 天"], ["30d", "近 30 天"], ["all", "全部"]];
function rangeStart() {
  if (state.range === "all") return null;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (state.range === "7d" ? 7 : 30));
  return d.getTime();
}
function countUp(el) {
  const target = Number(el.dataset.count); if (!target) return;
  const t0 = performance.now();
  const step = (now) => { const p = Math.min((now - t0) / 700, 1); el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
  el.textContent = "0"; requestAnimationFrame(step);
}
function playDashboardAnimations() {
  document.querySelectorAll("#app [data-count]").forEach(countUp);
  requestAnimationFrame(() => document.querySelectorAll("#app .track i[data-width]").forEach((el) => { el.style.width = el.dataset.width; }));
}

function renderDashboard() {
  const key = `dash|${state.range}`;
  const animate = !reducedMotion() && animKey !== key;
  animKey = key;
  const from = rangeStart();
  const inRange = (j) => { if (!from) return true; const t = tsOf(j.applicationDate || j.assessmentDeadline || ""); return Boolean(t) && t >= from; };
  const applied = state.jobs.filter((j) => j.bucket === "applied" && inRange(j)), wishlist = state.jobs.filter((j) => j.bucket === "wishlist");
  const assessment = applied.filter((j) => j.status === "待测评").length;
  const interview = applied.filter((j) => j.receivedInterview || j.status?.includes("面")).length;
  const high = state.jobs.filter((j) => j.preference === "5分" || ["非常想去", "想去"].includes(j.preference)).length;
  const ended = applied.filter((j) => j.status?.includes("挂") || j.status === "流程终止").length;
  const groups = [["已投递", applied.filter((j) => j.status === "已投递").length], ["待测评", assessment], ["面试中", applied.filter((j) => j.status?.includes("面") && !j.status.includes("挂") && !j.status.includes("通过")).length], ["已录用", applied.filter((j) => j.status === "已录用").length]];
  const width = (count) => (applied.length ? Math.max(count / applied.length * 100, count ? 6 : 0) : 0);
  const progress = groups.map(([label, count]) => `<div class="progress-row"><div><span>${label}</span><b>${count}</b></div><div class="track"><i data-width="${width(count)}%" style="width:${animate ? "0%" : width(count) + "%"}"></i></div></div>`).join("");
  const upcoming = applied.filter((j) => DEADLINE_LABELS[j.status]).sort((a, b) => (a.assessmentDeadline || "9999").localeCompare(b.assessmentDeadline || "9999"));
  const todos = upcoming.length ? upcoming.map((j) => { const m = deadlineMeta(j.assessmentDeadline); return `<article class="todo ${m.cls}"><div class="todo-time"><b>${j.assessmentDeadline ? dateText(j.assessmentDeadline) : "待填写"}</b><span>${m.label}</span></div><div><strong>${esc(j.company)} · ${esc(j.role || "岗位待补充")}</strong><small>${esc(DEADLINE_LABELS[j.status])} · ${esc(j.status)}</small></div><button class="action-btn" data-edit-job="${j.id}">Edit</button></article>`; }).join("") : `<div class="empty compact"><p>暂无待办节点</p></div>`;
  const recent = [...applied].sort((a, b) => (b.applicationDate || "").localeCompare(a.applicationDate || "")).slice(0, 6);
  const rangeTabs = `<div class="range-tabs" role="group" aria-label="统计时间范围">${RANGES.map(([k, l]) => `<button class="${k === state.range ? "active" : ""}" data-range="${k}">${l}</button>`).join("")}</div>`;
  $("app").innerHTML = `<section class="dashboard-head rise" style="--i:0"><div><span>已投递 <b>${applied.length}</b></span><span>待投递 <b>${wishlist.length}</b></span></div>${rangeTabs}<button class="primary" data-add-job="applied">＋ 添加投递</button></section>
  <section class="stats">${stat("01", "累计投递", applied.length, "实际投递岗位", animate ? 1 : -1)}${stat("02", "待测评", assessment, "关注截止时间", animate ? 2 : -1)}${stat("03", "进入面试", interview, "含待面试记录", animate ? 3 : -1)}${stat("04", "高期望岗位", high, "优先准备跟进", animate ? 4 : -1)}${stat("05", "流程结束", ended, "挂 / 流程终止", animate ? 5 : -1)}${stat("06", "待投递池", wishlist.length, "下一批目标", animate ? 6 : -1)}</section>
  <section class="grid-2">${card("流程分布", "按当前进度实时更新", `<div class="progress-list">${progress}</div>`, "", animate ? 7 : -1)}${card("近期事项", "按节点时间由近到远排列", `<div class="todo-list">${todos}</div>`, "", animate ? 8 : -1)}</section>
  ${card("最近投递", "最近更新的岗位记录", jobTable(recent, true), `<button class="text" data-go="applied">管理记录 ›</button>`, animate ? 9 : -1)}${backupBar()}`;
  if (animate) playDashboardAnimations();
}
function backupBar() { return `<div class="backup-bar"><button class="secondary" id="exportData">导出数据备份</button><button class="secondary" id="importData">导入备份</button><button class="secondary" id="resetData">清空所有数据</button></div>`; }
function nodeTime(job) { if (!DEADLINE_LABELS[job.status]) return "—"; const m = deadlineMeta(job.assessmentDeadline); return `<div class="deadline-cell ${m.cls}"><b>${job.assessmentDeadline ? dateText(job.assessmentDeadline) : "待填写"}</b><small>${m.label}</small></div>`; }
function jobDetailHtml(j) {
  const cells = [["公司性质", j.companyType], ["工作城市", j.city], ["投递渠道", j.channel], ["岗位期望值", j.preference], ["是否收到面试", j.receivedInterview ? "是" : "否"], ["投递日期", dateText(j.applicationDate)], ["挂掉 / 终止原因", j.failReason]].filter(([, v]) => v);
  const blocks = [["岗位要求 / JD", j.description], ["网上面试信息", j.interviewInfo], ["投递规则", j.applicationRule], ["我的经历匹配", j.experienceSummary]].filter(([, v]) => v);
  const history = (j.stageHistory || []).length ? `<div class="detail-block"><h5>节点记录</h5><ol class="detail-history">${[...j.stageHistory].reverse().map((h) => `<li><b>${esc(h.status)}</b><span>${esc(dateText(h.time))}</span></li>`).join("")}</ol></div>` : "";
  const link = j.jobUrl ? `<a class="detail-link" href="${esc(j.jobUrl)}" target="_blank" rel="noopener noreferrer">打开岗位链接 ↗</a>` : "";
  return `<div class="job-detail"><dl class="detail-grid">${cells.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>${blocks.map(([k, v]) => `<div class="detail-block"><h5>${esc(k)}</h5><p>${esc(v).replaceAll("\n", "<br>")}</p></div>`).join("")}${history}${link}</div>`;
}
function jobTable(jobs, compact = false) {
  const toggle = (j) => `<button class="detail-toggle" data-toggle-job="${j.id}" aria-expanded="${state.expanded.has(j.id)}" title="查看详情" aria-label="查看 ${esc(j.company)} 的完整信息">ⓘ</button>`;
  const actions = (j) => `<div class="actions"><button class="action-btn" data-edit-job="${j.id}">Edit</button>${compact ? "" : `<button class="action-btn delete" data-delete-job="${j.id}">Delete</button>`}</div>`;
  const rows = jobs.map((j) => { const detail = jobDetailHtml(j); return `<tr><td>${dateText(j.applicationDate)}</td><td><div class="company"><b>${esc(j.company)}${toggle(j)}</b><span>${esc(j.role || "岗位待补充")}</span></div></td><td>${esc(j.city || "—")}</td><td>${pill(j.status)}</td><td>${nodeTime(j)}</td><td>${esc(j.preference || "—")}</td><td>${actions(j)}</td></tr><tr class="detail-row" ${state.expanded.has(j.id) ? "" : "hidden"}><td colspan="7">${detail}</td></tr>`; }).join("");
  const mobile = jobs.map((j) => { const detail = jobDetailHtml(j); return `<article class="mobile-card"><div>${pill(j.status)}<small>${dateText(j.applicationDate)}</small></div><h4>${esc(j.company)}${toggle(j)}</h4><p>${esc(j.role || "岗位待补充")}</p><div class="job-detail" ${state.expanded.has(j.id) ? "" : "hidden"}>${detail}</div>${actions(j)}</article>`; }).join("");
  return `<div class="table-wrap"><table><thead><tr><th>投递日期</th><th>公司 / 岗位</th><th>地点</th><th>当前进度</th><th>节点时间</th><th>期望值</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-list">${mobile}</div></div>`;
}

function renderApplied() {
  const all = state.jobs.filter((j) => j.bucket === "applied"), q = state.search.toLowerCase().trim();
  const jobs = all.filter((j) => (!q || [j.company, j.role, j.city].some((v) => v?.toLowerCase().includes(q))) && (state.filter === "全部状态" || j.status === state.filter));
  const filterOptions = ["全部状态", ...STATUSES];
  const filters = `<div class="filters"><label class="search"><span aria-hidden="true">⌕</span><input id="searchInput" value="${esc(state.search)}" placeholder="搜索公司、岗位或城市" autocomplete="off" /></label><select id="statusFilter" aria-label="按当前进度筛选">${filterOptions.map((s) => `<option ${s === state.filter ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`;
  $("app").innerHTML = card(`全部投递 · ${all.length}`, "统计口径只包含已进入投递记录的岗位", `${filters}${jobs.length ? jobTable(jobs) : empty("没有找到匹配记录", "请更换关键词或筛选状态。")}`, `<button class="primary" data-add-job="applied">＋ 新增投递</button>`) + backupBar();
}

function renderWishlist() {
  const jobs = state.jobs.filter((j) => j.bucket === "wishlist");
  const cards = jobs.map((j) => `<article class="wish"><div class="logo">${esc(j.company.slice(0, 1))}</div><div class="wish-copy"><h3>${esc(j.company)}</h3><p>${esc(j.role || "岗位待确定")}</p>${j.companyType ? `<span>${esc(j.companyType)}</span>` : ""}</div><div class="wish-actions"><button class="secondary convert" data-convert="${j.id}">转为已投递</button><button class="action-btn" data-edit-job="${j.id}">Edit</button><button class="action-btn delete" data-delete-job="${j.id}">Delete</button></div></article>`).join("");
  $("app").innerHTML = card(`目标公司 · ${jobs.length}`, "维护待投目标，投递后转入正式记录", jobs.length ? `<div class="wishlist">${cards}</div>` : empty("待投递清单还是空的", "把感兴趣的公司和岗位收藏到这里。"), `<button class="primary" data-add-job="wishlist">＋ 添加目标</button>`) + backupBar();
}
function renderPrep() {
  const categories = [["experience", "经历打磨"], ["question", "常见问题"], ["self_intro", "自我介绍"]];
  const current = state.prep.filter((i) => i.category === state.prepCategory);
  const tabs = `<div class="tabs">${categories.map(([k, l]) => `<button class="${k === state.prepCategory ? "active" : ""}" data-prep-category="${k}">${l}<span>${state.prep.filter((i) => i.category === k).length}</span></button>`).join("")}</div>`;
  const list = current.length ? `<div class="prep-list">${current.map((i, n) => `<article class="prep"><span>${String(n + 1).padStart(2, "0")}</span><div><h3>${esc(i.title)}</h3><p>${esc(i.content || "还没有填写内容。")}</p></div><div class="actions"><button class="action-btn" data-edit-prep="${i.id}">Edit</button><button class="action-btn delete" data-delete-prep="${i.id}">Delete</button></div></article>`).join("")}</div>` : empty("这里还没有素材", "记录一个面试问题或准备一版自我介绍。");
  $("app").innerHTML = card("面试素材库", "经历故事、常见问题和自我介绍", tabs + list, `<button class="primary" data-add-prep>＋ 新增素材</button>`) + backupBar();
}

function emptyJob(bucket) { const base = Object.fromEntries(JOB_FIELDS.map((f) => [f, f === "receivedInterview" ? false : ""])); return { id: "", bucket, ...base, status: bucket === "applied" ? "已投递" : "待投递", applicationDate: bucket === "applied" ? new Date().toISOString().slice(0, 10) : "", stageHistory: [] }; }
function openJob(job) {
  const v = job || emptyJob("applied"), bucket = v.bucket || "applied", edit = Boolean(v.id);
  $("jobModal").dataset.bucket = bucket;
  $("jobModalTitle").textContent = edit ? (bucket === "wishlist" ? "编辑待投目标" : "编辑投递记录") : (bucket === "wishlist" ? "添加待投目标" : "新增投递");
  $("jobModalKicker").textContent = bucket === "wishlist" ? "WISHLIST" : "JOB RECORD";
  $("jobId").value = v.id || "";
  $("status").value = normalizeStatus(v.status, bucket);
  JOB_FIELDS.forEach((f) => { const el = $(f); if (!el || f === "status" || f === "assessmentDeadline") return; el.value = f === "receivedInterview" ? String(Boolean(v[f])) : (v[f] ?? ""); });
  $("assessmentDeadline").value = dateTimeInput(v.assessmentDeadline);
  document.querySelectorAll(".applied-only").forEach((el) => { el.hidden = bucket !== "applied"; });
  syncFormRules(); $("jobModal").hidden = false; setTimeout(() => $("company").focus(), 30);
}
function syncNextStageTime() {
  const stage = $("nextStage").value, need = Boolean(stage && DEADLINE_LABELS[stage]);
  $("nextStageTimeField").hidden = !need; $("nextStageTime").required = need;
  if (need) $("nextStageTimeHint").textContent = `「${stage}」已排期，请填写时间`;
}
function syncFormRules() {
  const applied = $("jobModal").dataset.bucket === "applied", status = $("status").value;
  const label = DEADLINE_LABELS[status], showDeadline = applied && Boolean(label);
  $("deadlineField").hidden = !showDeadline; $("assessmentDeadline").required = showDeadline;
  if (showDeadline) { $("deadlineLabel").innerHTML = `${esc(label)} <b>*</b>`; $("deadlineHint").textContent = `当前进度为“${status}”时必填`; }
  const showFail = applied && (/挂$/.test(status) || ["已放弃", "流程终止"].includes(status));
  $("failReasonField").hidden = !showFail; $("failReason").required = showFail;
  const next = applied ? (NEXT_STAGE[status] || []) : [];
  $("nextStageField").hidden = !applied || next.length === 0;
  $("nextStage").innerHTML = `<option value="">暂不推进</option>` + next.map((s) => `<option>${esc(s)}</option>`).join("");
  syncNextStageTime();
}
function collectJob() {
  const b = $("jobModal").dataset.bucket, applied = b === "applied", v = { bucket: b };
  JOB_FIELDS.forEach((f) => {
    const el = $(f); if (!el) return;
    if (f === "status") { v.status = applied ? el.value : "待投递"; return; }
    if (f === "receivedInterview") { v.receivedInterview = applied && el.value === "true"; return; }
    if (f === "company") { v.company = el.value.trim(); return; }
    if (f === "role" || f === "companyType") { v[f] = el.value.trim() || null; return; }
    v[f] = applied ? (el.value.trim() || null) : null;
  });
  return v;
}
function closeModal(id) { $(id).hidden = true; }

function getAI() { try { return { provider: "deepseek", baseUrl: "", apiKey: "", model: "", ...JSON.parse(localStorage.getItem(AI_STORE) || "{}") }; } catch { return { provider: "deepseek", baseUrl: "", apiKey: "", model: "" }; } }
function setAI(cfg) { localStorage.setItem(AI_STORE, JSON.stringify(cfg)); }
function maskKey(k) { if (!k) return ""; if (k.length <= 4) return "****"; return "****" + k.slice(-4); }
const aiReady = (cfg) => Boolean(cfg.apiKey && cfg.baseUrl && cfg.model);
async function callAI(prompt, cfg) {
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` }, body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: prompt }], temperature: 0.7 }) });
  if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(`${res.status} ${t.slice(0, 50)}`.trim()); }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "（模型没有返回内容，可稍后重试）";
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); notify("已复制，粘贴到外部 AI 即可"); return true; }
  catch { const el = $("aiGenResult"); if (el) { el.value = text; el.focus(); el.select(); } notify("已选中内容，请按 ⌘/Ctrl + C 复制"); return false; }
}
function buildGenPrompt(desc, jobId) {
  const job = jobId ? state.jobs.find((j) => String(j.id) === String(jobId)) : null;
  const role = job ? [job.company, job.role].filter(Boolean).join(" · ") : "（未指定，按通用校招场景处理）";
  return PROMPTS[state.prepCategory]({ topic: desc || "（未填写）", role, jd: job?.description || "（未提供 JD）", raw: desc || "（未提供，请基于主题合理补充，并标注需要我确认的地方）" });
}
function openAIGen() {
  const jobs = state.jobs.filter((j) => j.bucket === "applied");
  $("aiGenJob").innerHTML = `<option value="">不关联</option>` + jobs.map((j) => `<option value="${j.id}">${esc([j.company, j.role].filter(Boolean).join(" · "))}</option>`).join("");
  $("aiDesc").value = ""; $("aiGenResult").value = "";
  $("aiGenModal").hidden = false; setTimeout(() => $("aiDesc").focus(), 30);
}
async function generateAIGen() {
  const desc = $("aiDesc").value.trim();
  if (!desc) { notify("请先描述你想要的素材"); return; }
  const prompt = buildGenPrompt(desc, $("aiGenJob").value);
  const cfg = getAI(), btn = $("aiGenGenerate"), label = btn.textContent;
  if (!aiReady(cfg)) { $("aiGenResult").value = prompt; await copyText(prompt); notify("已复制提示词，可直接粘贴到外部 AI，也可从上方结果框复制"); return; }
  btn.disabled = true; btn.textContent = "生成中…";
  try {
    const text = await callAI(prompt, cfg);
    $("aiGenResult").value = text; notify("生成完成，可编辑后应用到素材");
  } catch (err) {
    $("aiGenResult").value = prompt; notify(`调用失败（${err.message}），已切回提示词模式`);
  } finally { btn.disabled = false; btn.textContent = label; }
}
function copyAIGen() { const t = ($("aiGenResult")?.value || "").trim(); if (!t) { notify("还没有内容可复制"); return; } copyText(t); }
function saveAIGen() {
  const text = ($("aiGenResult")?.value || "").trim();
  if (!text) { notify("还没有可应用的内容"); return; }
  const ta = $("prepContent");
  if (!ta) { notify("请先打开素材编辑框"); return; }
  ta.value = text; closeModal("aiGenModal"); notify("已填入素材编辑框，可调整后保存");
}
function renderAIConfig() {
  const c = getAI(), ready = aiReady(c);
  const providers = PROVIDERS.map((p) => `<option value="${p.id}" ${p.id === c.provider ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  const masked = maskKey(c.apiKey);
  $("app").innerHTML = card("AI 配置", "配置大模型 Key，仅存本机浏览器，不上传", `
    <div class="ai-config">
      <p class="ai-note ${ready ? "ok" : ""}">${ready ? `已接入 ${esc(c.model)}，生成将直接调用` : "未配置 Key — 生成会降级为复制提示词"}</p>
      <label><span>服务商</span><select id="cfgProvider">${providers}</select></label>
      <label><span>Base URL</span><input id="cfgBaseUrl" value="${esc(c.baseUrl)}" placeholder="https://api.deepseek.com/v1" /></label>
      <label><span>模型名</span><input id="cfgModel" value="${esc(c.model)}" placeholder="deepseek-chat" /></label>
      <label><span>API Key</span><input id="cfgApiKey" type="password" value="" placeholder="${c.apiKey ? "已配置（脱敏展示）— 留空表示不改动，输入新值将覆盖" : "sk-…"}" autocomplete="off" /></label>
      <p class="ai-note key-status"><b>当前状态：</b>${c.apiKey ? `已配置（脱敏展示：<code>${esc(masked)}</code>），原文仅存于本机浏览器` : "未配置 Key"}。<br/>Key 写入本机 localStorage（键名 <code>${esc(AI_STORE)}</code>），不会进入导出的备份文件，也不会上传到所选服务商以外的任何地方。</p>
      <div class="ai-actions"><button class="primary" id="cfgSave">保存配置</button><button class="secondary" id="cfgClear">清除 Key</button></div>
    </div>
  `) + backupBar();
}
function openPrep(i) { $("prepId").value = i?.id || ""; $("prepCategory").value = i?.category || state.prepCategory; $("prepTitle").value = i?.title || ""; $("prepContent").value = i?.content || ""; $("prepModal").hidden = false; }

function exportData() { const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), jobs: state.jobs, prep: state.prep, nextId: state.nextId }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `秋招台账备份_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href); notify("数据备份已导出"); }
function importData() { const input = document.createElement("input"); input.type = "file"; input.accept = "application/json"; input.onchange = () => { const file = input.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const d = JSON.parse(reader.result); if (!Array.isArray(d.jobs) || !Array.isArray(d.prep)) throw new Error(); state.jobs = migrate(d.jobs); state.prep = d.prep; state.nextId = d.nextId || Math.max(0, ...state.jobs.map((x) => x.id), ...state.prep.map((x) => x.id)) + 1; save(); render(); notify("数据备份已导入"); } catch { alert("备份文件格式不正确。"); } }; reader.readAsText(file); }; input.click(); }
function resetData() { if (!confirm("确定清空所有数据吗？此操作不可撤销，建议先导出备份。")) return; state.jobs = []; state.prep = []; state.nextId = 1; if (state.expanded) state.expanded.clear(); save(); render(); notify("已清空所有数据"); }
function applySearch(value) { state.search = value; renderApplied(); const input = $("searchInput"); if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); } }

document.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.page) { state.page = b.dataset.page; $("sidebar").classList.remove("open"); render(); }
  if (b.dataset.range) { state.range = b.dataset.range; animKey = ""; render(); }
  if (b.dataset.go) { state.page = b.dataset.go; render(); }
  if (b.dataset.addJob) openJob(emptyJob(b.dataset.addJob));
  if (b.dataset.toggleJob) { const id = Number(b.dataset.toggleJob); state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id); render(); }
  if (b.dataset.editJob) { const j = state.jobs.find((x) => x.id === Number(b.dataset.editJob)); if (j) openJob(j); }
  if (b.dataset.deleteJob) { const id = Number(b.dataset.deleteJob), j = state.jobs.find((x) => x.id === id); if (j && confirm(`确认删除“${j.company}”吗？`)) { state.jobs = state.jobs.filter((x) => x.id !== id); save(); render(); notify("岗位记录已删除"); } }
  if (b.dataset.convert) { const j = state.jobs.find((x) => x.id === Number(b.dataset.convert)); if (j) { j.bucket = "applied"; j.status = "已投递"; j.applicationDate = new Date().toISOString().slice(0, 10); save(); render(); notify("已转入投递记录"); } }
  if (b.dataset.close) closeModal(b.dataset.close);
  if (b.dataset.prepCategory) { state.prepCategory = b.dataset.prepCategory; render(); }
  if (b.hasAttribute("data-add-prep")) openPrep();
  if (b.dataset.editPrep) { const i = state.prep.find((x) => x.id === Number(b.dataset.editPrep)); if (i) openPrep(i); }
  if (b.dataset.deletePrep) { const id = Number(b.dataset.deletePrep), i = state.prep.find((x) => x.id === id); if (i && confirm(`确认删除“${i.title}”吗？`)) { state.prep = state.prep.filter((x) => x.id !== id); save(); render(); notify("面试素材已删除"); } }
  if (b.id === "exportData") exportData(); if (b.id === "importData") importData(); if (b.id === "resetData") resetData();
  if (b.id === "prepCatBtn") openAIGen();
  if (b.id === "aiGenGenerate") generateAIGen();
  if (b.id === "aiGenSave") saveAIGen();
  if (b.id === "aiGenCopy" || b.id === "aiGenCopy2") copyAIGen();
  if (b.id === "cfgSave") { const entered = $("cfgApiKey").value.trim(); const prev = getAI(); const next = { provider: $("cfgProvider").value, baseUrl: $("cfgBaseUrl").value.trim(), model: $("cfgModel").value.trim(), apiKey: entered || prev.apiKey }; setAI(next); render(); notify(entered ? "AI 配置已保存" : "配置已更新（Key 留空未改动）"); }
  if (b.id === "cfgClear") { const c = getAI(); c.apiKey = ""; setAI(c); render(); notify("已清除 API Key"); }
});
$("enterTracker").addEventListener("click", () => { $("cover").classList.add("cover-hidden"); setTimeout(() => { $("cover").hidden = true; }, 520); });
$("menuButton").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("status").innerHTML = STATUSES.map((s) => `<option>${s}</option>`).join("");
$("status").addEventListener("change", syncFormRules);
$("receivedInterview").addEventListener("change", syncFormRules);
$("nextStage").addEventListener("change", syncNextStageTime);
$("jobForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = collectJob(), id = Number($("jobId").value);
  const existing = id ? state.jobs.find((j) => j.id === id) : null;
  const errors = validateJob(v, existing);
  if (errors.length) { alert(errors.join("\n")); return; }
  if (v.nextStage) {
    const history = [...(existing?.stageHistory || [])];
    if (v.assessmentDeadline) history.push({ status: v.status, time: v.assessmentDeadline, at: new Date().toISOString() });
    v.stageHistory = history;
    v.assessmentDeadline = v.nextStageTime || null;
    v.status = v.nextStage;
  }
  delete v.nextStage; delete v.nextStageTime;
  if (id) state.jobs = state.jobs.map((j) => j.id === id ? { ...j, ...v } : j);
  else state.jobs.push({ id: state.nextId++, ...v, stageHistory: v.stageHistory || [] });
  save(); closeModal("jobModal"); render(); notify(id ? "岗位记录已更新" : "岗位记录已添加");
});
$("prepForm").addEventListener("submit", (e) => { e.preventDefault(); const id = Number($("prepId").value), v = { category: $("prepCategory").value, title: $("prepTitle").value.trim(), content: $("prepContent").value.trim() || null }; if (id) state.prep = state.prep.map((i) => i.id === id ? { ...i, ...v } : i); else state.prep.push({ id: state.nextId++, ...v }); save(); closeModal("prepModal"); render(); notify("面试素材已保存"); });
$("app").addEventListener("compositionstart", (e) => { if (e.target.id === "searchInput") composing = true; });
$("app").addEventListener("compositionend", (e) => { if (e.target.id === "searchInput") { composing = false; clearTimeout(searchTimer); applySearch(e.target.value); } });
$("app").addEventListener("input", (e) => {
  if (e.target.id === "searchInput" && !composing) { const value = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => applySearch(value), 260); }
});
$("app").addEventListener("change", (e) => {
  if (e.target.id === "statusFilter") { state.filter = e.target.value; renderApplied(); }
  if (e.target.id === "cfgProvider") { const p = PROVIDERS.find((x) => x.id === e.target.value); if (p?.baseUrl) { $("cfgBaseUrl").value = p.baseUrl; $("cfgModel").value = p.model; } }
});
// AI 配置改用 05 板块内联表单（renderAIConfig），原 aiModal 弹窗已移除

function init() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { const d = JSON.parse(saved); state = { ...state, ...d, jobs: migrate(d.jobs || []) }; save(); }
    else { state = { ...state, jobs: [], prep: [], nextId: 1 }; save(); }
    render();
  } catch { $("app").innerHTML = empty("数据加载失败", "请刷新页面重试。"); }
}
init();
