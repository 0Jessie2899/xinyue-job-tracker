const STORAGE_KEY = "xinyue-job-tracker-v1";
const STATUSES = ["待投递","可投","已投递","简历初筛通过","简历挂","测评","测评通过","测评挂","AI面","AI面通过","AI面挂","业务面","业务面通过","业务面挂","一面","一面通过","一面挂","二面","二面通过","二面挂","终面","终面通过","终面挂","HR面","HR面通过","HR面挂","已录用","已放弃","流程终止"];
const titles = {
  dashboard:["求职看板","今天也把秋招往前推进一点点。"],
  applied:["投递记录","所有已投岗位与流程状态，一处掌握。"],
  wishlist:["待投递清单","收藏目标公司，排好下一步行动。"],
  prep:["面试准备","沉淀经历故事、常见问题和自我介绍。"]
};
let state = {jobs:[],prep:[],page:"dashboard",search:"",filter:"全部状态",prepCategory:"experience",nextId:1};
const $ = (id) => document.getElementById(id);
const t = (value) => typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null;
const date = (value) => { const valueText=t(value); return valueText && /^\d{4}\.\d{2}\.\d{2}$/.test(valueText) ? valueText.replaceAll(".","-") : valueText; };
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const dateText = (value) => value ? String(value).slice(0,10).replaceAll("-",".") : "—";

function fromSpreadsheet(source){
  let id=1;
  const jobs=source.applications.slice(1).filter(row=>t(row[2])).map(row=>{
    const applied=Boolean(t(row[0])||t(row[1])||t(row[10]));
    return {id:id++,bucket:applied?"applied":"wishlist",applicationDate:date(row[1]),company:t(row[2]),companyType:t(row[3]),city:t(row[4]),role:t(row[5]),description:t(row[6]),interviewInfo:t(row[7]),applicationRule:t(row[8]),channel:t(row[9]),status:t(row[10])||(applied?"已投递":"待投递"),assessmentDeadline:date(row[11]),receivedInterview:t(row[12])==="是",experienceSummary:t(row[13]),jobUrl:t(row[14]),preference:t(row[15])};
  });
  source.wishlist.slice(1).filter(row=>t(row[2])).forEach(row=>jobs.push({id:id++,bucket:"wishlist",applicationDate:null,company:t(row[2]),companyType:t(row[3]),city:null,role:null,description:null,interviewInfo:null,applicationRule:null,channel:null,status:t(row[1])==="可投"?"可投":"待投递",assessmentDeadline:null,receivedInterview:false,experienceSummary:null,jobUrl:null,preference:null}));
  const prep=[];
  source.experience.slice(1).filter(row=>t(row[1])).forEach((row,index)=>prep.push({id:id++,category:"experience",title:t(row[1]),content:t(row[2]),sortOrder:index+1}));
  source.questions.slice(1).filter(row=>t(row[1])).forEach((row,index)=>prep.push({id:id++,category:"question",title:t(row[1]),content:t(row[2]),sortOrder:index+1}));
  return {jobs,prep,nextId:id};
}
function save(){ localStorage.setItem(STORAGE_KEY,JSON.stringify({jobs:state.jobs,prep:state.prep,nextId:state.nextId})); }
function notify(message){ const box=$("notice"); box.textContent=`✓ ${message}`; box.hidden=false; clearTimeout(notify.timer); notify.timer=setTimeout(()=>box.hidden=true,2600); }
function statusTone(status){ if(!status)return ""; if(status.includes("挂")||["流程终止","已放弃"].includes(status))return "danger"; if(status==="已录用"||status.includes("通过"))return "success"; if(status==="测评"||status.includes("面"))return "warning"; return ""; }
function pill(status){ return `<span class="pill ${statusTone(status)}">${esc(status||"—")}</span>`; }
function empty(icon,title,text,action=""){return `<div class="empty"><i>${icon}</i><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;}

function render(){
  const [title,subtitle]=titles[state.page]; $("pageTitle").textContent=title; $("pageSubtitle").textContent=subtitle;
  document.querySelectorAll("[data-page]").forEach(button=>button.classList.toggle("active",button.dataset.page===state.page));
  if(state.page==="dashboard") renderDashboard();
  if(state.page==="applied") renderApplied();
  if(state.page==="wishlist") renderWishlist();
  if(state.page==="prep") renderPrep();
}

function card(title,subtitle,body,action=""){return `<section class="card"><header><div><h3>${esc(title)}</h3>${subtitle?`<p>${esc(subtitle)}</p>`:""}</div>${action}</header>${body}</section>`;}
function stat(icon,label,value,note){return `<article class="stat"><i>${icon}</i><div><span>${label}</span><strong>${value}</strong><small>${note}</small></div></article>`;}

function renderDashboard(){
  const applied=state.jobs.filter(job=>job.bucket==="applied"), wishlist=state.jobs.filter(job=>job.bucket==="wishlist");
  const assessment=applied.filter(job=>job.status==="测评").length;
  const interviews=applied.filter(job=>job.receivedInterview||job.status?.includes("面")).length;
  const high=state.jobs.filter(job=>job.preference?.startsWith("5")||job.preference==="非常想去").length;
  const ended=applied.filter(job=>job.status?.includes("挂")||job.status==="流程终止").length;
  const groups=[
    ["已投递",applied.filter(job=>job.status==="已投递").length,"#2563eb"],
    ["测评中",assessment,"#f59e0b"],
    ["面试中",applied.filter(job=>job.status?.includes("面")&&!job.status?.includes("挂")).length,"#8b5cf6"],
    ["已录用",applied.filter(job=>job.status==="已录用").length,"#10b981"]
  ];
  const progress=groups.map(([label,count,color])=>`<div class="progress-row"><div><span>${label}</span><b>${count}</b></div><div class="track"><i style="width:${applied.length?Math.max(count/applied.length*100,count?6:0):0}%;background:${color}"></i></div></div>`).join("");
  const upcoming=applied.filter(job=>job.status==="测评"||job.assessmentDeadline).sort((a,b)=>(a.assessmentDeadline||"9999").localeCompare(b.assessmentDeadline||"9999")).slice(0,5);
  const todos=upcoming.length?upcoming.map(job=>`<div class="todo"><span>◷</span><div><b>${esc(job.company)} · ${esc(job.role||"岗位待补充")}</b><small>${job.assessmentDeadline?`测评截止 ${dateText(job.assessmentDeadline)}`:"测评截止时间待填写"}</small></div></div>`).join(""):`<div class="empty" style="min-height:150px"><p>暂无测评事项</p></div>`;
  const recent=[...applied].sort((a,b)=>(b.applicationDate||"").localeCompare(a.applicationDate||"")).slice(0,6);
  $("app").innerHTML=`
    <section class="hero"><div><span class="eyebrow">AUTUMN RECRUITMENT</span><h2>把每一次投递，变成可复盘的成长。</h2><p>目前已投递 <b>${applied.length}</b> 个岗位，待投递池还有 <b>${wishlist.length}</b> 个目标。</p></div><button class="primary" data-add-job="applied">＋ 添加投递</button></section>
    <section class="stats">${stat("▣","累计投递",applied.length,"按实际岗位统计")}${stat("◷","测评进行中",assessment,"关注截止时间")}${stat("↗","进入面试",interviews,"含收到面试记录")}${stat("♡","高期望岗位",high,"优先准备跟进")}${stat("!","流程结束",ended,"挂 / 流程终止")}${stat("○","待投递池",wishlist.length,"下一批目标")}</section>
    <section class="grid-2">${card("流程分布","按当前进度实时更新",`<div class="progress-list">${progress}</div>`,`<button class="text" data-go="applied">查看全部 ›</button>`)}${card("近期事项","测评截止与待补信息",`<div class="todo-list">${todos}</div>`)}</section>
    ${card("最近投递","最近更新的岗位记录",jobTable(recent,true),`<button class="text" data-go="applied">管理记录 ›</button>`)}
    ${backupBar()}`;
}

function backupBar(){return `<div class="backup-bar"><button class="secondary" id="exportData">导出数据备份</button><button class="secondary" id="importData">导入备份</button><button class="secondary" id="resetData">恢复表格初始数据</button></div>`;}
function jobTable(jobs,compact=false){
  const rows=jobs.map(job=>`<tr><td>${dateText(job.applicationDate)}</td><td><div class="company"><b>${esc(job.company)}</b><span>${esc(job.role||"岗位待补充")}</span></div></td><td>${esc(job.city||"—")}</td><td>${pill(job.status)}</td><td class="${job.status==="测评"&&!job.assessmentDeadline?"deadline":""}">${job.assessmentDeadline?dateText(job.assessmentDeadline):job.status==="测评"?"待填写":"—"}</td><td>${esc(job.preference||"—")}</td><td><div class="actions"><button data-edit-job="${job.id}" title="编辑">✎</button>${compact?"":`<button class="delete" data-delete-job="${job.id}" title="删除">⌫</button>`}</div></td></tr>`).join("");
  const mobile=jobs.map(job=>`<article class="mobile-card"><div>${pill(job.status)}<small>${dateText(job.applicationDate)}</small></div><h4>${esc(job.company)}</h4><p>${esc(job.role||"岗位待补充")}</p><div class="actions"><button data-edit-job="${job.id}">✎ 编辑</button>${compact?"":`<button class="delete" data-delete-job="${job.id}">⌫ 删除</button>`}</div></article>`).join("");
  return `<div class="table-wrap"><table><thead><tr><th>投递日期</th><th>公司 / 岗位</th><th>地点</th><th>当前进度</th><th>测评截止</th><th>期望值</th><th></th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-list">${mobile}</div></div>`;
}

function renderApplied(){
  const all=state.jobs.filter(job=>job.bucket==="applied");
  const statuses=["全部状态",...new Set(all.map(job=>job.status).filter(Boolean))];
  const needle=state.search.toLowerCase().trim();
  const jobs=all.filter(job=>(!needle||[job.company,job.role,job.city].some(value=>value?.toLowerCase().includes(needle)))&&(state.filter==="全部状态"||job.status===state.filter));
  const filters=`<div class="filters"><label class="search">⌕ <input id="searchInput" placeholder="搜索公司、岗位或城市" value="${esc(state.search)}"></label><select id="statusFilter">${statuses.map(item=>`<option ${item===state.filter?"selected":""}>${esc(item)}</option>`).join("")}</select></div>`;
  $("app").innerHTML=card(`全部投递 · ${all.length}`,"统计口径只包含已进入投递记录的岗位",`${filters}${jobs.length?jobTable(jobs):empty("⌕","没有找到匹配记录","换个关键词或清除筛选条件试试。")}`,`<button class="primary" data-add-job="applied">＋ 新增投递</button>`)+backupBar();
}

function renderWishlist(){
  const jobs=state.jobs.filter(job=>job.bucket==="wishlist");
  const cards=jobs.map(job=>`<article class="wish"><div class="wish-top"><div class="logo">${esc(job.company.slice(0,1))}</div>${pill(job.status)}</div><h3>${esc(job.company)}</h3><p>${esc(job.role||"岗位待确定")}</p><div class="tags">${job.companyType?`<span>${esc(job.companyType)}</span>`:""}${job.city?`<span>${esc(job.city)}</span>`:""}</div><div class="wish-actions"><button class="secondary" data-convert="${job.id}">标记已投</button><button class="icon" data-edit-job="${job.id}">✎</button><button class="icon delete" data-delete-job="${job.id}">⌫</button></div></article>`).join("");
  $("app").innerHTML=card(`目标公司 · ${jobs.length}`,"投递后可一键转入正式记录",jobs.length?`<div class="wishlist">${cards}</div>`:empty("♡","待投递清单还是空的","把感兴趣的公司和岗位先收藏到这里。",`<button class="primary" data-add-job="wishlist">＋ 添加目标</button>`),`<button class="primary" data-add-job="wishlist">＋ 添加目标</button>`)+backupBar();
}

function renderPrep(){
  const categories=[["experience","经历打磨"],["question","常见问题"],["self_intro","自我介绍"]];
  const current=state.prep.filter(item=>item.category===state.prepCategory);
  const tabs=`<div class="tabs">${categories.map(([key,label])=>`<button class="${key===state.prepCategory?"active":""}" data-prep-category="${key}">${label}<span>${state.prep.filter(item=>item.category===key).length}</span></button>`).join("")}</div>`;
  const list=current.length?`<div class="prep-list">${current.map((item,index)=>`<article class="prep"><span>${String(index+1).padStart(2,"0")}</span><div><h3>${esc(item.title)}</h3><p>${esc(item.content||"还没有填写内容，点击编辑开始整理。")}</p></div><div class="actions"><button data-edit-prep="${item.id}">✎</button><button class="delete" data-delete-prep="${item.id}">⌫</button></div></article>`).join("")}</div>`:empty("▤","这里还没有素材","记录一个面试问题或准备一版自我介绍。",`<button class="primary" data-add-prep>＋ 新增素材</button>`);
  $("app").innerHTML=card("面试素材库","把回答写下来，再慢慢迭代成自己的语言",tabs+list,`<button class="primary" data-add-prep>＋ 新增素材</button>`)+backupBar();
}

function openJob(job){
  const isEdit=Boolean(job); const value=job||{id:"",bucket:"applied",applicationDate:new Date().toISOString().slice(0,10),company:"",companyType:"",city:"",role:"",description:"",interviewInfo:"",applicationRule:"",channel:"",status:"已投递",assessmentDeadline:"",receivedInterview:false,experienceSummary:"",jobUrl:"",preference:""};
  $("jobModalTitle").textContent=isEdit?"编辑岗位记录":value.bucket==="wishlist"?"添加待投目标":"新增投递";
  ["jobId","company","role","city","companyType","applicationDate","status","assessmentDeadline","channel","preference","jobUrl","description","interviewInfo","applicationRule","experienceSummary"].forEach(id=>$(id).value=value[id]??"");
  $("receivedInterview").value=String(Boolean(value.receivedInterview));
  $("jobModal").dataset.bucket=value.bucket;
  document.querySelectorAll("[data-bucket]").forEach(button=>button.classList.toggle("active",button.dataset.bucket===value.bucket));
  updateConditionalFields(); $("jobModal").hidden=false;
}
function updateConditionalFields(){ const bucket=$("jobModal").dataset.bucket; $("applicationDateField").hidden=bucket!=="applied"; const show=$("status").value==="测评"; $("assessmentField").hidden=!show; $("assessmentDeadline").required=show; }
function closeModal(id){ $(id).hidden=true; }
function collectJob(){ return {bucket:$("jobModal").dataset.bucket,applicationDate:$("applicationDate").value||null,company:$("company").value.trim(),companyType:$("companyType").value.trim()||null,city:$("city").value.trim()||null,role:$("role").value.trim()||null,description:$("description").value.trim()||null,interviewInfo:$("interviewInfo").value.trim()||null,applicationRule:$("applicationRule").value.trim()||null,channel:$("channel").value.trim()||null,status:$("status").value,assessmentDeadline:$("assessmentDeadline").value||null,receivedInterview:$("receivedInterview").value==="true",experienceSummary:$("experienceSummary").value.trim()||null,jobUrl:$("jobUrl").value.trim()||null,preference:$("preference").value||null}; }
function openPrep(item){ $("prepId").value=item?.id||""; $("prepCategory").value=item?.category||state.prepCategory; $("prepTitle").value=item?.title||""; $("prepContent").value=item?.content||""; $("prepModal").hidden=false; }

function exportData(){ const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),jobs:state.jobs,prep:state.prep,nextId:state.nextId},null,2)],{type:"application/json"}); const link=document.createElement("a"); link.href=URL.createObjectURL(blob); link.download=`秋招台账备份_${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(link.href); notify("数据备份已导出"); }
function importData(){ const input=document.createElement("input"); input.type="file"; input.accept="application/json"; input.onchange=()=>{ const file=input.files?.[0]; if(!file)return; const reader=new FileReader(); reader.onload=()=>{ try{ const data=JSON.parse(reader.result); if(!Array.isArray(data.jobs)||!Array.isArray(data.prep))throw new Error(); state.jobs=data.jobs; state.prep=data.prep; state.nextId=data.nextId||Math.max(0,...state.jobs.map(x=>x.id),...state.prep.map(x=>x.id))+1; save(); render(); notify("数据备份已导入"); }catch{alert("备份文件格式不正确。");} }; reader.readAsText(file); }; input.click(); }
async function resetData(){ if(!confirm("确定恢复表格初始数据吗？当前修改会被覆盖，建议先导出备份。"))return; const source=await fetch("./tracker-source.json").then(r=>r.json()); const initial=fromSpreadsheet(source); state={...state,...initial}; save(); render(); notify("已恢复表格初始数据"); }

document.addEventListener("click",(event)=>{
  const button=event.target.closest("button"); if(!button)return;
  if(button.dataset.page){state.page=button.dataset.page;document.querySelector(".sidebar").classList.remove("open");render();}
  if(button.dataset.go){state.page=button.dataset.go;render();}
  if(button.dataset.addJob){ const bucket=button.dataset.addJob; openJob({id:"",bucket,applicationDate:bucket==="applied"?new Date().toISOString().slice(0,10):null,company:"",companyType:null,city:null,role:null,description:null,interviewInfo:null,applicationRule:null,channel:null,status:bucket==="applied"?"已投递":"待投递",assessmentDeadline:null,receivedInterview:false,experienceSummary:null,jobUrl:null,preference:null}); }
  if(button.dataset.editJob){const job=state.jobs.find(x=>x.id===Number(button.dataset.editJob));if(job)openJob(job);}
  if(button.dataset.deleteJob){const id=Number(button.dataset.deleteJob),job=state.jobs.find(x=>x.id===id);if(job&&confirm(`确认删除“${job.company}”吗？`)){state.jobs=state.jobs.filter(x=>x.id!==id);save();render();notify("岗位记录已删除");}}
  if(button.dataset.convert){const job=state.jobs.find(x=>x.id===Number(button.dataset.convert));if(job){job.bucket="applied";job.status="已投递";job.applicationDate=new Date().toISOString().slice(0,10);save();render();notify("已转入投递记录");}}
  if(button.dataset.bucket){$("jobModal").dataset.bucket=button.dataset.bucket;document.querySelectorAll("[data-bucket]").forEach(item=>item.classList.toggle("active",item===button));updateConditionalFields();}
  if(button.dataset.close)closeModal(button.dataset.close);
  if(button.dataset.prepCategory){state.prepCategory=button.dataset.prepCategory;render();}
  if(button.hasAttribute("data-add-prep"))openPrep();
  if(button.dataset.editPrep){const item=state.prep.find(x=>x.id===Number(button.dataset.editPrep));if(item)openPrep(item);}
  if(button.dataset.deletePrep){const id=Number(button.dataset.deletePrep),item=state.prep.find(x=>x.id===id);if(item&&confirm(`确认删除“${item.title}”吗？`)){state.prep=state.prep.filter(x=>x.id!==id);save();render();notify("面试素材已删除");}}
  if(button.id==="exportData")exportData(); if(button.id==="importData")importData(); if(button.id==="resetData")resetData();
});
$("menuButton").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
$("status").innerHTML=STATUSES.map(status=>`<option>${status}</option>`).join("");
$("status").addEventListener("change",updateConditionalFields);
$("jobForm").addEventListener("submit",(event)=>{event.preventDefault();const value=collectJob();if(value.status==="测评"&&!value.assessmentDeadline){alert("当前进度为“测评”时，必须填写测评截止日期。");return;}const id=Number($("jobId").value);if(id){state.jobs=state.jobs.map(job=>job.id===id?{...job,...value}:job);}else state.jobs.push({id:state.nextId++,...value});save();closeModal("jobModal");render();notify(id?"岗位记录已更新":"岗位记录已添加");});
$("prepForm").addEventListener("submit",(event)=>{event.preventDefault();const id=Number($("prepId").value);const value={category:$("prepCategory").value,title:$("prepTitle").value.trim(),content:$("prepContent").value.trim()||null,sortOrder:state.prep.length+1};if(id)state.prep=state.prep.map(item=>item.id===id?{...item,...value}:item);else state.prep.push({id:state.nextId++,...value});save();closeModal("prepModal");render();notify("面试素材已保存");});
$("app").addEventListener("input",(event)=>{if(event.target.id==="searchInput"){state.search=event.target.value;renderApplied();$("searchInput").focus();$("searchInput").setSelectionRange(state.search.length,state.search.length);}});
$("app").addEventListener("change",(event)=>{if(event.target.id==="statusFilter"){state.filter=event.target.value;renderApplied();}});

async function init(){
  try{
    const saved=localStorage.getItem(STORAGE_KEY);
    if(saved){const data=JSON.parse(saved);state={...state,...data};}
    else{const source=await fetch("./tracker-source.json").then(response=>response.json());const initial=fromSpreadsheet(source);state={...state,...initial};save();}
    render();
  }catch(error){$("app").innerHTML=empty("!","数据加载失败","请刷新页面或检查 tracker-source.json 是否完整。")}
}
init();
