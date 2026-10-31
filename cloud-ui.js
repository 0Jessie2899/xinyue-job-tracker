/* Public project configuration only. Never add a service_role/secret key here. */
const CLOUD_CONFIG = Object.freeze({
  url: "https://pnyrnybnelxcptvpbhjm.supabase.co",
  key: "sb_publishable_HYCQ8CnAu5AP4MfmCEGzcw_zR0X6RVn",
  owner: "cfb916e6-d53f-4b31-9994-bf6ba0b1c9ca"
});

const Cloud = (() => {
  let client, store, user = null, loaded = false, busy = false, dirty = false;
  let message = "连接云端中…", problem = false, epoch = 0;
  const draftKey = "xinyue-cloud-draft-" + CLOUD_CONFIG.owner;
  const owner = () => user?.id === CLOUD_CONFIG.owner;
  const payload = () => ({ jobs: state.jobs, prep: state.prep, nextId: state.nextId });
  const isOpenForm = () => !$("jobModal").hidden || !$("prepModal").hidden || !$("aiGenModal").hidden;
  function snapshot(d) {
    if (!d || !Array.isArray(d.jobs) || !Array.isArray(d.prep)) throw new Error("备份必须包含 jobs 和 prep 列表。");
    for (const [items, label] of [[d.jobs, "岗位"], [d.prep, "素材"]]) {
      const ids = new Set();
      for (const item of items) {
        if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || ids.has(item.id)) throw new Error(`${label}编号缺失或重复，请检查备份。`);
        ids.add(item.id);
        if (label === "岗位" && (typeof item.company !== "string" || !["applied", "wishlist"].includes(item.bucket))) throw new Error("备份中的岗位格式不正确。");
        if (label === "素材" && (typeof item.title !== "string" || !["experience", "question", "self_intro"].includes(item.category))) throw new Error("备份中的素材格式不正确。");
      }
    }
    const maxId = Math.max(0, ...d.jobs.map(j => j.id), ...d.prep.map(p => p.id));
    return { jobs: migrate(d.jobs), prep: d.prep, nextId: Math.max(maxId + 1, Number.isSafeInteger(d.nextId) ? d.nextId : 1) };
  }
  function apply(d) {
    const next = snapshot(d);
    state.jobs = next.jobs; state.prep = next.prep; state.nextId = next.nextId;
    state.expanded.clear(); state.prepExpanded.clear();
  }
  function hasDraft() { try { return !!localStorage.getItem(draftKey); } catch { return false; } }
  function hasLegacy() {
    try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY)); return !!(d?.jobs?.length || d?.prep?.length); } catch { return false; }
  }
  function clearDraft() { try { localStorage.removeItem(draftKey); } catch { /* Remote save remains authoritative. */ } }
  function status(text, error = false) { message = text; problem = error; panel(); }
  function panel() {
    document.body.classList.toggle("cloud-locked", !loaded);
    document.body.classList.toggle("cloud-viewer", loaded && !owner());
    document.body.classList.toggle("cloud-busy", busy);
    document.body.classList.toggle("cloud-dirty", dirty);
    $("cloudPanel").innerHTML = `<div class="cloud-status ${problem ? "cloud-error" : ""}" role="status"><div><b>${esc(user ? owner() ? "我的云端台账" : "共享台账 · 只读" : "云端台账")}</b><span>${esc(message)}</span></div><div class="cloud-actions">${user ? `<button class="secondary" id="cloudReload" ${busy ? "disabled" : ""}>读取云端</button><button class="text" id="cloudLogout" ${busy ? "disabled" : ""}>退出登录</button>` : ""}${owner() && loaded ? `<button class="secondary" id="cloudShare" ${busy || dirty ? "disabled" : ""}>查看授权</button>` : ""}${owner() && dirty ? `<button class="primary" id="cloudRetry" ${busy ? "disabled" : ""}>重试保存</button><button class="secondary" id="cloudExport">导出未保存内容</button>` : ""}</div></div>${owner() && loaded && !dirty && (store.payload === null || hasDraft()) ? `<div class="cloud-migration"><strong>${store.payload === null ? "云端尚未导入你的台账" : "发现本机保留的未保存草稿"}</strong><p>${store.payload === null ? "请选择之前导出的 JSON 备份，确认后上传。原浏览器数据会保留。" : "可以先恢复查看或导出草稿；保存时仍会检查版本，防止覆盖其他设备的更新。"}</p><div class="cloud-actions"><button class="primary" id="cloudImport" ${busy ? "disabled" : ""}>导入 JSON 备份</button>${store.payload === null && hasLegacy() ? '<button class="secondary" id="cloudMigrate">迁移原浏览器台账</button>' : ""}${hasDraft() ? '<button class="secondary" id="cloudRestore">恢复未保存草稿</button>' : ""}</div></div>` : ""}`;
    const profile = document.querySelector(".profile small");
    if (profile) profile.textContent = user ? owner() ? "已登录 · 所有者" : "已登录 · 只读" : "请先登录";
  }
  function gate(text = "请使用已创建的台账账号登录。") {
    loaded = false;
    state.jobs = []; state.prep = []; state.nextId = 1;
    state.expanded.clear(); state.prepExpanded.clear();
    clearTimeout(searchTimer); clearTimeout(highlightTimer);
    for (const id of ["jobModal", "prepModal", "aiGenModal", "cloudShareModal"]) closeModal(id);
    $("jobForm").reset(); $("prepForm").reset(); $("aiGenForm").reset();
    completionDraft = [];
    $("notice").hidden = true;
    panel();
    $("app").innerHTML = `<section class="cloud-login card"><span class="cloud-login-mark">J</span><h2>登录你的求职空间</h2><p>${esc(text)}</p><form id="cloudLoginForm"><label><span>邮箱</span><input name="email" type="email" autocomplete="username" required /></label><label><span>密码</span><input name="password" type="password" autocomplete="current-password" required /></label><button class="primary" type="submit">登录</button><p id="cloudLoginError" class="cloud-error-text" role="alert"></p></form><small>台账仅对所有者和获得授权的朋友开放。</small></section>`;
  }
  function editable() {
    if (!owner() || !loaded) { notify("请先使用所有者账号登录并加载台账。"); return false; }
    if (busy || dirty) { notify("请先处理当前未保存的修改。"); return false; }
    return true;
  }
  async function load() {
    if (!user || busy) return;
    if ((dirty || isOpenForm()) && !confirm("读取云端会替换当前页面内容，未提交的表单会关闭。未保存草稿仍保留在本机，建议先导出。继续吗？")) return;
    const generation = ++epoch;
    busy = true;
    // Clear the previous view before rechecking permissions (including revocation).
    gate("正在核验账号和读取云端台账…");
    status("正在读取云端…");
    try {
      const result = await store.read();
      if (generation !== epoch || !user) return;
      apply(result.payload || { jobs: [], prep: [], nextId: 1 });
      loaded = true; dirty = false; state.page = "dashboard";
      status(result.payload === null ? "连接成功 · 等待首次导入" : "已读取云端最新记录");
      render();
    } catch (e) {
      if (generation !== epoch) return;
      gate("暂时无法读取台账。可点击上方“读取云端”重试，或退出后切换账号。");
      status(e.message || "连接失败，请检查网络后重试。", true);
    } finally { if (generation === epoch) { busy = false; panel(); } }
  }
  async function save() {
    if (!owner() || !loaded || busy) throw new Error("当前无法保存，请先加载台账或等待上一操作完成。");
    const generation = epoch, d = snapshot(payload());
    // Drafts are account-scoped and never loaded for viewers or before login.
    let cached = true;
    try { localStorage.setItem(draftKey, JSON.stringify({ revision: store.revision, payload: d })); } catch { cached = false; }
    dirty = true; busy = true; status("正在保存到云端…");
    try {
      await store.write(d, user.id);
      if (generation !== epoch) return;
      dirty = false; clearDraft(); status("已保存到云端");
    } catch (e) {
      if (generation === epoch) status(`${e.message || "云端保存失败。"}${cached ? " 未保存内容已保留在本机，请重试或导出。" : " 请立即导出未保存内容，本机缓存不可用。"}`, true);
      e.cloudReported = true;
      throw e;
    } finally { if (generation === epoch) { busy = false; panel(); } }
  }
  async function importSnapshot(raw, label) {
    if (!editable()) return;
    const next = snapshot(raw);
    if (!confirm(`${label}：${next.jobs.length} 条岗位、${next.prep.length} 条素材。\n将替换当前云端台账，建议先导出云端备份。确认导入吗？`)) return;
    apply(next);
    try { await save(); render(); notify("备份已导入并保存到云端"); }
    catch (e) { render(); throw e; }
  }
  function importFile() {
    if (!editable()) return;
    const input = document.createElement("input"); input.type = "file"; input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        let d;
        try { d = JSON.parse(await file.text()); } catch { throw new Error("无法读取 JSON 文件，请选择台账导出的备份。"); }
        await importSnapshot(d, "导入备份");
      } catch (e) { report(e); }
    };
    input.click();
  }
  async function showShares() {
    if (!owner() || !loaded || busy || dirty) return;
    $("cloudShareModal").hidden = false;
    $("cloudViewerList").textContent = "正在读取授权名单…";
    const list = await store.viewers();
    $("cloudViewerList").innerHTML = list.length ? list.map(v => `<li><code>${esc(v.viewer_id)}</code><button type="button" class="action-btn delete" data-cloud-revoke="${esc(v.viewer_id)}">撤销授权</button></li>`).join("") : '<li>暂无朋友获得查看权限。</li>';
  }
  function report(e) { if (!e.cloudReported) status(e.message || "操作失败，请稍后重试。", true); }
  async function start() {
    gate();
    if (!window.supabase?.createClient) { status("登录组件未能加载，请刷新页面重试。", true); return; }
    client = window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.key, {
      auth: { storageKey: "xinyue-cloud-auth-v1", detectSessionInUrl: false },
      global: { fetch: async (url, options = {}) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (options.signal?.aborted) controller.abort();
        options.signal?.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(abort, 20000);
        try { return await fetch(url, { ...options, signal: controller.signal }); }
        finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
      } }
    });
    store = new TrackerStore(client, CLOUD_CONFIG.owner);
    // Keep this callback synchronous: Supabase warns against awaiting auth calls here.
    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        ++epoch; user = null; busy = false; dirty = false;
        store.revision = null; store.payload = null;
        gate("你已退出登录。"); status("未登录");
      } else if (event === "SIGNED_IN" && session?.user.id !== user?.id) {
        user = session.user;
        setTimeout(() => load(), 0);
      }
    });
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (data.session && !user) { user = data.session.user; await load(); }
      else if (!data.session) status("未登录");
    } catch (e) { report(e); }
  }
  document.addEventListener("submit", async e => {
    if (e.target.id !== "cloudLoginForm" && e.target.id !== "cloudShareForm") return;
    e.preventDefault();
    const button = e.target.querySelector('[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    try {
      if (e.target.id === "cloudLoginForm") {
        const form = new FormData(e.target);
        if (!client) throw new Error("登录组件未就绪，请刷新页面重试。");
        const { data, error } = await client.auth.signInWithPassword({ email: String(form.get("email")).trim(), password: String(form.get("password")) });
        if (error) throw new Error("登录失败，请检查邮箱、密码以及邮箱是否已确认。");
        if (user?.id !== data.user.id) { user = data.user; await load(); }
        e.target.reset();
      } else {
        if (!editable()) return;
        const uid = $("cloudViewerUid").value.trim();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) throw new Error("请输入朋友账号的完整 User UID。");
        if (uid.toLowerCase() === CLOUD_CONFIG.owner) throw new Error("你已经是台账所有者，无需再次授权。");
        await store.grant(uid); $("cloudViewerUid").value = "";
        await showShares(); notify("已授予朋友只读权限");
      }
    } catch (err) {
      if (e.target.id === "cloudLoginForm" && $("cloudLoginError")) $("cloudLoginError").textContent = err.message;
      else { report(err); $("cloudShareError").textContent = "操作失败：请确认朋友账号已在 Authentication → Users 中创建，且尚未授权。"; }
    } finally { button.disabled = false; }
  });
  document.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    try {
      if (b.id === "cloudReload") await load();
      if (b.id === "cloudLogout") {
        if (busy || dirty || (isOpenForm() && !confirm("退出会关闭尚未提交的表单，确认退出吗？"))) return;
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
      }
      if (b.id === "cloudRetry") { await save(); render(); }
      if (b.id === "cloudExport") exportData();
      if (b.id === "cloudImport") importFile();
      if (b.id === "cloudMigrate") await importSnapshot(JSON.parse(localStorage.getItem(STORAGE_KEY)), "迁移原浏览器台账");
      if (b.id === "cloudRestore" && editable()) {
        const draft = JSON.parse(localStorage.getItem(draftKey));
        if (!draft || !Number.isSafeInteger(draft.revision)) throw new Error("草稿格式不正确，请使用 JSON 备份恢复。");
        apply(draft.payload); store.revision = draft.revision; dirty = true;
        render(); status("已恢复草稿，尚未上传。可导出，或点击“重试保存”。");
      }
      if (b.id === "cloudShare") { $("cloudShareError").textContent = ""; await showShares(); }
      if (b.dataset.cloudRevoke && owner() && loaded && !busy && !dirty && confirm("撤销后，对方下次读取云端时将无法查看。已经看到或下载的副本无法收回。确认撤销吗？")) {
        await store.revoke(b.dataset.cloudRevoke); await showShares(); notify("已撤销查看权限");
      }
    } catch (err) { report(err); }
  });
  // Block hidden or forged edit controls as well as visible controls. RLS is the
  // actual security boundary; this guard prevents accidental local mutations.
  document.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const mutates = b.matches('[data-add-job],[data-edit-job],[data-delete-job],[data-convert],[data-add-prep],[data-edit-prep],[data-delete-prep],[data-remove-completion],#addCompletion,#importData,#resetData,#prepCatBtn,#aiGenSave,#cfgSave,#cfgClear');
    if ((mutates && !editable()) || (!loaded && b.matches('[data-page],[data-go]'))) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener("beforeunload", e => { if (dirty || busy && loaded) { e.preventDefault(); e.returnValue = ""; } });
  return { start, save, editable, importFile, report, panel, loaded: () => loaded, owner, snapshot };
})();
