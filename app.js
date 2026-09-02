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
  "待二面": "二面时间", "待终面": "终面时间", "待HR面": "HR面时间"
};
const LEGACY = { "已投": "已投递", "测评": "待测评", "AI面": "待AI面", "一面": "待一面", "二面": "待二面", "终面": "待终面", "HR面": "待HR面" };
const TITLES = { dashboard: "求职看板", applied: "投递记录", wishlist: "待投递清单", prep: "面试准备" };
let state = { jobs: [], prep: [], page: "dashboard", search: "", filter: "全部状态", prepCategory: "experience", nextId: 1 };
let composing = false, searchTimer;
const $ = (id) => document.getElementById(id);
const trim = (v) => typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const normalizeDate = (v) => { const s = trim(v); return s && /^\d{4}\.\d{2}\.\d{2}$/.test(s) ? s.replaceAll(".", "-") : s; };
const normalizeStatus = (s, bucket) => bucket === "wishlist" ? (s || "待投递") : (LEGACY[s] || (s === "待投递" ? "已投递" : s) || "已投递");

function dateText(value) {
  if (!value) return "—";
  const [day, time] = String(value).split("T");
  return `${day.slice(0, 10).replaceAll("-", ".")}${time ? ` ${time.slice(0, 5)}` : ""}`;
}
function dateTimeInput(value) { return !value ? "" : String(value).includes("T") ? String(value).slice(0, 16) : `${String(value).slice(0, 10)}T23:59`; }

function fromSpreadsheet(source) {
  let id = 1;
  const jobs = source.applications.slice(1).filter((r) => trim(r[2])).map((r) => {
    const applied = Boolean(trim(r[0]) || trim(r[1]) || trim(r[10]));
    const bucket = applied ? "applied" : "wishlist";
    return { id: id++, bucket, applicationDate: normalizeDate(r[1]), company: trim(r[2]), companyType: trim(r[3]), city: trim(r[4]), role: trim(r[5]), description: trim(r[6]), interviewInfo: trim(r[7]), applicationRule: trim(r[8]), channel: trim(r[9]), status: normalizeStatus(trim(r[10]) || (applied ? "已投递" : "待投递"), bucket), assessmentDeadline: normalizeDate(r[11]), receivedInterview: trim(r[12]) === "是", experienceSummary: trim(r[13]), jobUrl: trim(r[14]), preference: trim(r[15]) };
  });
  source.wishlist.slice(1).filter((r) => trim(r[2])).forEach((r) => jobs.push({ id: id++, bucket: "wishlist", company: trim(r[2]), role: null, companyType: trim(r[3]), status: "待投递", applicationDate: null, city: null, description: null, interviewInfo: null, applicationRule: null, channel: null, assessmentDeadline: null, receivedInterview: false, experienceSummary: null, jobUrl: null, preference: null }));
  const prep = [];
  source.experience.slice(1).filter((r) => trim(r[1])).forEach((r, i) => prep.push({ id: id++, category: "experience", title: trim(r[1]), content: trim(r[2]), sortOrder: i + 1 }));
  source.questions.slice(1).filter((r) => trim(r[1])).forEach((r, i) => prep.push({ id: id++, category: "question", title: trim(r[1]), content: trim(r[2]), sortOrder: i + 1 }));
  return { jobs, prep, nextId: id };
}
function migrate(jobs) { return jobs.map((j) => ({ ...j, status: normalizeStatus(j.status, j.bucket) })); }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobs: state.jobs, prep: state.prep, nextId: state.nextId })); }
function notify(message) { const n = $("notice"); n.textContent = `✓ ${message}`; n.hidden = false; clearTimeout(notify.timer); notify.timer = setTimeout(() => { n.hidden = true; }, 2800); }
function tone(status) { if (status?.includes("挂") || ["流程终止", "已放弃"].includes(status)) return "danger"; if (status === "已录用" || status?.includes("通过") || status === "已测评") return "success"; if (status?.startsWith("待") || status?.includes("面")) return "warning"; return ""; }
function pill(status) { return `<span class="pill ${tone(status)}">${esc(status || "—")}</span>`; }
function empty(title, text, action = "") { return `<div class="empty"><span>—</span><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`; }
function card(title, subtitle, body, action = "") { return `<section class="card"><header><div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>${action}</header>${body}</section>`; }
function stat(no, title, value, note) { return `<article class="stat"><i>${no}</i><div><span>${title}</span><strong>${value}</strong><small>${note}</small></div></article>`; }

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

function render() {
  $("pageTitle").textContent = TITLES[state.page];
  document.querySelectorAll("[data-page]").forEach((b) => b.classList.toggle("active", b.dataset.page === state.page));
  ({ dashboard: renderDashboard, applied: renderApplied, wishlist: renderWishlist, prep: renderPrep }[state.page])();
}

function renderDashboard() {
  const applied = state.jobs.filter((j) => j.bucket === "applied"), wishlist = state.jobs.filter((j) => j.bucket === "wishlist");
  const assessment = applied.filter((j) => j.status === "待测评").length;
  const interview = applied.filter((j) => j.receivedInterview || j.status?.includes("面")).length;
  const high = state.jobs.filter((j) => j.preference?.startsWith("5") || j.preference === "非常想去").length;
  const ended = applied.filter((j) => j.status?.includes("挂") || j.status === "流程终止").length;
  const groups = [["已投递", applied.filter((j) => j.status === "已投递").length], ["待测评", assessment], ["面试中", applied.filter((j) => j.status?.includes("面") && !j.status.includes("挂") && !j.status.includes("通过")).length], ["已录用", applied.filter((j) => j.status === "已录用").length]];
  const progress = groups.map(([label, count]) => `<div class="progress-row"><div><span>${label}</span><b>${count}</b></div><div class="track"><i style="width:${applied.length ? Math.max(count / applied.length * 100, count ? 6 : 0) : 0}%"></i></div></div>`).join("");
  const upcoming = applied.filter((j) => DEADLINE_LABELS[j.status]).sort((a, b) => (a.assessmentDeadline || "9999").localeCompare(b.assessmentDeadline || "9999"));
  const todos = upcoming.length ? upcoming.map((j) => { const m = deadlineMeta(j.assessmentDeadline); return `<article class="todo ${m.cls}"><div class="todo-time"><b>${j.assessmentDeadline ? dateText(j.assessmentDeadline) : "待填写"}</b><span>${m.label}</span></div><div><strong>${esc(j.company)} · ${esc(j.role || "岗位待补充")}</strong><small>${esc(DEADLINE_LABELS[j.status])} · ${esc(j.status)}</small></div><button class="action-btn" data-edit-job="${j.id}">Edit</button></article>`; }).join("") : `<div class="empty compact"><p>暂无待办节点</p></div>`;
  const recent = [...applied].sort((a, b) => (b.applicationDate || "").localeCompare(a.applicationDate || "")).slice(0, 6);
  $("app").innerHTML = `<section class="dashboard-head"><div><span>已投递 <b>${applied.length}</b></span><span>待投递 <b>${wishlist.length}</b></span></div><button class="primary" data-add-job="applied">＋ 添加投递</button></section>
  <section class="stats">${stat("01", "累计投递", applied.length, "实际投递岗位")}${stat("02", "待测评", assessment, "关注截止时间")}${stat("03", "进入面试", interview, "含待面试记录")}${stat("04", "高期望岗位", high, "优先准备跟进")}${stat("05", "流程结束", ended, "挂 / 流程终止")}${stat("06", "待投递池", wishlist.length, "下一批目标")}</section>
  <section class="grid-2">${card("流程分布", "按当前进度实时更新", `<div class="progress-list">${progress}</div>`)}${card("近期事项", "按节点时间由近到远排列", `<div class="todo-list">${todos}</div>`)}</section>
  ${card("最近投递", "最近更新的岗位记录", jobTable(recent, true), `<button class="text" data-go="applied">管理记录 ›</button>`)}${backupBar()}`;
}
function backupBar() { return `<div class="backup-bar"><button class="secondary" id="exportData">导出数据备份</button><button class="secondary" id="importData">导入备份</button><button class="secondary" id="resetData">恢复表格初始数据</button></div>`; }
function nodeTime(job) { if (!DEADLINE_LABELS[job.status]) return "—"; const m = deadlineMeta(job.assessmentDeadline); return `<div class="deadline-cell ${m.cls}"><b>${job.assessmentDeadline ? dateText(job.assessmentDeadline) : "待填写"}</b><small>${m.label}</small></div>`; }
function jobTable(jobs, compact = false) {
  const rows = jobs.map((j) => `<tr><td>${dateText(j.applicationDate)}</td><td><div class="company"><b>${esc(j.company)}</b><span>${esc(j.role || "岗位待补充")}</span></div></td><td>${esc(j.city || "—")}</td><td>${pill(j.status)}</td><td>${nodeTime(j)}</td><td>${esc(j.preference || "—")}</td><td><div class="actions"><button class="action-btn" data-edit-job="${j.id}">Edit</button>${compact ? "" : `<button class="action-btn delete" data-delete-job="${j.id}">Delete</button>`}</div></td></tr>`).join("");
  const mobile = jobs.map((j) => `<article class="mobile-card"><div>${pill(j.status)}<small>${dateText(j.applicationDate)}</small></div><h4>${esc(j.company)}</h4><p>${esc(j.role || "岗位待补充")}</p><div class="actions"><button class="action-btn" data-edit-job="${j.id}">Edit</button>${compact ? "" : `<button class="action-btn delete" data-delete-job="${j.id}">Delete</button>`}</div></article>`).join("");
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

function emptyJob(bucket) { return { id: "", bucket, applicationDate: bucket === "applied" ? new Date().toISOString().slice(0, 10) : null, company: "", companyType: "", city: "", role: "", description: "", interviewInfo: "", applicationRule: "", channel: "", status: bucket === "applied" ? "已投递" : "待投递", assessmentDeadline: "", receivedInterview: false, experienceSummary: "", jobUrl: "", preference: "" }; }
function openJob(job) {
  const v = job || emptyJob("applied"), bucket = v.bucket || "applied", edit = Boolean(v.id);
  $("jobModal").dataset.bucket = bucket;
  $("jobModalTitle").textContent = edit ? (bucket === "wishlist" ? "编辑待投目标" : "编辑投递记录") : (bucket === "wishlist" ? "添加待投目标" : "新增投递");
  $("jobModalKicker").textContent = bucket === "wishlist" ? "WISHLIST" : "JOB RECORD";
  $("jobId").value = v.id || "";
  ["company", "role", "companyType", "city", "applicationDate", "channel", "preference", "jobUrl", "description", "interviewInfo", "applicationRule", "experienceSummary"].forEach((id) => { $(id).value = v[id] ?? ""; });
  $("status").value = normalizeStatus(v.status, bucket); $("assessmentDeadline").value = dateTimeInput(v.assessmentDeadline); $("receivedInterview").value = String(Boolean(v.receivedInterview));
  document.querySelectorAll(".applied-only").forEach((el) => { el.hidden = bucket !== "applied"; });
  updateDeadlineField(); $("jobModal").hidden = false; setTimeout(() => $("company").focus(), 30);
}
function updateDeadlineField() { const label = DEADLINE_LABELS[$("status").value], show = $("jobModal").dataset.bucket === "applied" && Boolean(label); $("deadlineField").hidden = !show; $("assessmentDeadline").required = show; if (show) { $("deadlineLabel").innerHTML = `${esc(label)} <b>*</b>`; $("deadlineHint").textContent = `当前进度为“${$("status").value}”时必填`; } }
function collectJob() { const b = $("jobModal").dataset.bucket, applied = b === "applied"; return { bucket: b, company: $("company").value.trim(), role: $("role").value.trim() || null, companyType: $("companyType").value.trim() || null, city: applied ? ($("city").value.trim() || null) : null, applicationDate: applied ? ($("applicationDate").value || null) : null, status: applied ? $("status").value : "待投递", assessmentDeadline: applied ? ($("assessmentDeadline").value || null) : null, channel: applied ? ($("channel").value.trim() || null) : null, preference: applied ? ($("preference").value || null) : null, receivedInterview: applied && $("receivedInterview").value === "true", jobUrl: applied ? ($("jobUrl").value.trim() || null) : null, description: applied ? ($("description").value.trim() || null) : null, interviewInfo: applied ? ($("interviewInfo").value.trim() || null) : null, applicationRule: applied ? ($("applicationRule").value.trim() || null) : null, experienceSummary: applied ? ($("experienceSummary").value.trim() || null) : null }; }
function closeModal(id) { $(id).hidden = true; }
function openPrep(i) { $("prepId").value = i?.id || ""; $("prepCategory").value = i?.category || state.prepCategory; $("prepTitle").value = i?.title || ""; $("prepContent").value = i?.content || ""; $("prepModal").hidden = false; }

function exportData() { const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), jobs: state.jobs, prep: state.prep, nextId: state.nextId }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `秋招台账备份_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href); notify("数据备份已导出"); }
function importData() { const input = document.createElement("input"); input.type = "file"; input.accept = "application/json"; input.onchange = () => { const file = input.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const d = JSON.parse(reader.result); if (!Array.isArray(d.jobs) || !Array.isArray(d.prep)) throw new Error(); state.jobs = migrate(d.jobs); state.prep = d.prep; state.nextId = d.nextId || Math.max(0, ...state.jobs.map((x) => x.id), ...state.prep.map((x) => x.id)) + 1; save(); render(); notify("数据备份已导入"); } catch { alert("备份文件格式不正确。"); } }; reader.readAsText(file); }; input.click(); }
async function resetData() { if (!confirm("确定恢复表格初始数据吗？当前修改会被覆盖，建议先导出备份。")) return; const initial = fromSpreadsheet(await fetch("./tracker-source.json").then((r) => r.json())); state = { ...state, ...initial }; save(); render(); notify("已恢复表格初始数据"); }
function applySearch(value) { state.search = value; renderApplied(); const input = $("searchInput"); if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); } }

document.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.page) { state.page = b.dataset.page; $("sidebar").classList.remove("open"); render(); }
  if (b.dataset.go) { state.page = b.dataset.go; render(); }
  if (b.dataset.addJob) openJob(emptyJob(b.dataset.addJob));
  if (b.dataset.editJob) { const j = state.jobs.find((x) => x.id === Number(b.dataset.editJob)); if (j) openJob(j); }
  if (b.dataset.deleteJob) { const id = Number(b.dataset.deleteJob), j = state.jobs.find((x) => x.id === id); if (j && confirm(`确认删除“${j.company}”吗？`)) { state.jobs = state.jobs.filter((x) => x.id !== id); save(); render(); notify("岗位记录已删除"); } }
  if (b.dataset.convert) { const j = state.jobs.find((x) => x.id === Number(b.dataset.convert)); if (j) { j.bucket = "applied"; j.status = "已投递"; j.applicationDate = new Date().toISOString().slice(0, 10); save(); render(); notify("已转入投递记录"); } }
  if (b.dataset.close) closeModal(b.dataset.close);
  if (b.dataset.prepCategory) { state.prepCategory = b.dataset.prepCategory; render(); }
  if (b.hasAttribute("data-add-prep")) openPrep();
  if (b.dataset.editPrep) { const i = state.prep.find((x) => x.id === Number(b.dataset.editPrep)); if (i) openPrep(i); }
  if (b.dataset.deletePrep) { const id = Number(b.dataset.deletePrep), i = state.prep.find((x) => x.id === id); if (i && confirm(`确认删除“${i.title}”吗？`)) { state.prep = state.prep.filter((x) => x.id !== id); save(); render(); notify("面试素材已删除"); } }
  if (b.id === "exportData") exportData(); if (b.id === "importData") importData(); if (b.id === "resetData") resetData();
});
$("enterTracker").addEventListener("click", () => { $("cover").classList.add("cover-hidden"); setTimeout(() => { $("cover").hidden = true; }, 520); });
$("menuButton").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("status").innerHTML = STATUSES.map((s) => `<option>${s}</option>`).join("");
$("status").addEventListener("change", updateDeadlineField);
$("jobForm").addEventListener("submit", (e) => { e.preventDefault(); const v = collectJob(), label = DEADLINE_LABELS[v.status]; if (label && !v.assessmentDeadline) { alert(`当前进度为“${v.status}”时，必须填写${label}。`); return; } const id = Number($("jobId").value); if (id) state.jobs = state.jobs.map((j) => j.id === id ? { ...j, ...v } : j); else state.jobs.push({ id: state.nextId++, ...v }); save(); closeModal("jobModal"); render(); notify(id ? "岗位记录已更新" : "岗位记录已添加"); });
$("prepForm").addEventListener("submit", (e) => { e.preventDefault(); const id = Number($("prepId").value), v = { category: $("prepCategory").value, title: $("prepTitle").value.trim(), content: $("prepContent").value.trim() || null }; if (id) state.prep = state.prep.map((i) => i.id === id ? { ...i, ...v } : i); else state.prep.push({ id: state.nextId++, ...v }); save(); closeModal("prepModal"); render(); notify("面试素材已保存"); });
$("app").addEventListener("compositionstart", (e) => { if (e.target.id === "searchInput") composing = true; });
$("app").addEventListener("compositionend", (e) => { if (e.target.id === "searchInput") { composing = false; clearTimeout(searchTimer); applySearch(e.target.value); } });
$("app").addEventListener("input", (e) => { if (e.target.id === "searchInput" && !composing) { const value = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => applySearch(value), 260); } });
$("app").addEventListener("change", (e) => { if (e.target.id === "statusFilter") { state.filter = e.target.value; renderApplied(); } });

async function init() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { const d = JSON.parse(saved); state = { ...state, ...d, jobs: migrate(d.jobs || []) }; save(); }
    else { state = { ...state, ...fromSpreadsheet(await fetch("./tracker-source.json").then((r) => r.json())) }; save(); }
    render();
  } catch { $("app").innerHTML = empty("数据加载失败", "请刷新页面或检查初始数据文件。"); }
}
init();
