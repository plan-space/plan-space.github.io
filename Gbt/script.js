const LOGO = "https://cdn.imgurl.ir/uploads/j9346_InShot_20260930_141619549.png";
const KEY = "space-chi-v1";

const defaultData = {
  spaces: [
    {
      id: uid(), name: "My Space", meta: "فضای شخصی تو",
      boxes: [
        {id:uid(),type:"note",title:"یادداشت اول",content:"اینجا می‌تونی هر چیزی که می‌خوای نگه داری. <strong>بولد</strong>، <em>ایتالیک</em> و <a href=\"https://example.com\" target=\"_blank\">لینک</a> هم پشتیبانی می‌شن."},
        {id:uid(),type:"task",title:"کارهای امروز",content:"اولین کار مهم",done:false},
        {id:uid(),type:"link",title:"Space Chi",content:"https://example.com"},
        {id:uid(),type:"folder",title:"پروژه‌ها",content:"",children:[]}
      ]
    },
    {id:uid(),name:"Ideas",meta:"ایده‌ها و پروژه‌ها",boxes:[]}
  ],
  activeSpace: null,
  view:"grid"
};
defaultData.activeSpace = defaultData.spaces[0].id;

let data = load();
let selectedType = "note";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function uid(){ return "id_" + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }
function load(){
  try { const x=JSON.parse(localStorage.getItem(KEY)); return x || structuredClone(defaultData); }
  catch(e){ return structuredClone(defaultData); }
}
function save(){ localStorage.setItem(KEY,JSON.stringify(data)); }
function activeSpace(){ return data.spaces.find(s=>s.id===data.activeSpace) || data.spaces[0]; }
function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function icon(type){return {note:"✎",task:"✓",link:"↗",folder:"□"}[type]||"•";}
function typeLabel(type){return {note:"NOTE",task:"TASK",link:"LINK",folder:"FOLDER"}[type]||type;}

function render(){
  if(!data.spaces.length){ data.spaces.push({id:uid(),name:"My Space",meta:"فضای شخصی تو",boxes:[]}); data.activeSpace=data.spaces[0].id; }
  if(!activeSpace()) data.activeSpace=data.spaces[0].id;
  renderTabs(); renderSpace();
  document.body.dataset.view=data.view;
}
function renderTabs(){
  $("#tabs").innerHTML=data.spaces.map(s=>`
    <div class="tab ${s.id===data.activeSpace?"active":""}" data-space="${s.id}">
      <span class="tab-dot"></span><span class="tab-name">${esc(s.name)}</span>
      <button class="tab-close" data-close="${s.id}" title="بستن">×</button>
    </div>`).join("");
  $$(".tab").forEach(t=>t.addEventListener("click",e=>{
    if(e.target.closest(".tab-close")) return;
    data.activeSpace=t.dataset.space; save(); render();
  }));
  $$("[data-close]").forEach(b=>b.addEventListener("click",e=>{
    e.stopPropagation();
    if(data.spaces.length===1){toast("حداقل یک اسپیس باید باقی بمونه");return}
    const id=b.dataset.close, idx=data.spaces.findIndex(s=>s.id===id);
    data.spaces=data.spaces.filter(s=>s.id!==id);
    if(id===data.activeSpace) data.activeSpace=data.spaces[Math.max(0,idx-1)].id;
    save();render();
  }));
}
function renderSpace(){
  const s=activeSpace();
  $("#spaceTitle").textContent=s.name;
  $("#spaceMeta").textContent=s.meta || "فضای شخصی تو";
  $("#boxCount").textContent=`${s.boxes.length} باکس`;
  const board=$("#board"); board.className="board "+(data.view==="list"?"list-view":"grid-view");
  if(!s.boxes.length){
    board.innerHTML=`<div class="empty"><div><strong>این اسپیس خالیه</strong><p>با «افزودن باکس» اولین موردت رو بساز.</p></div></div>`;
    return;
  }
  board.innerHTML=s.boxes.map(boxHTML).join("");
  bindBoxes();
}
function boxHTML(b){
  let body="";
  if(b.type==="note") body=`<div class="note-content box-content">${b.content||""}</div>`;
  if(b.type==="task") body=`<div class="task-row ${b.done?"done":""}"><input type="checkbox" ${b.done?"checked":""} data-task="${b.id}"><span>${esc(b.content||"کار جدید")}</span></div>`;
  if(b.type==="link") body=`<a class="link-url box-content" href="${esc(safeUrl(b.content))}" target="_blank" rel="noopener">${esc(b.content||"بدون لینک")}</a>`;
  if(b.type==="folder"){
    const children=b.children||[];
    body=`<div class="box-content">${children.length?`${children.length} مورد داخل پوشه`:"پوشه خالیه"}</div>
      <div class="folder-items">${children.map(c=>`<div class="folder-item">↳ ${esc(c.title||c.content||"بدون عنوان")}</div>`).join("")}</div>`;
  }
  return `<article class="box ${b.type}" data-id="${b.id}">
    <div class="box-head"><div class="box-icon">${icon(b.type)}</div><span class="box-type">${typeLabel(b.type)}</span><button class="box-menu" data-menu="${b.id}">⋯</button></div>
    <div class="box-body"><div class="box-title">${esc(b.title||typeLabel(b.type))}</div>${body}</div>
  </article>`;
}
function safeUrl(url){
  if(!url) return "#";
  try{const u=new URL(url);return /^https?:$/.test(u.protocol)?u.href:"#"}catch{return "#"}
}
function bindBoxes(){
  $$("[data-task]").forEach(c=>c.addEventListener("change",()=>{
    const b=activeSpace().boxes.find(x=>x.id===c.dataset.task); b.done=c.checked;save();render();
  }));
  $$("[data-menu]").forEach(b=>b.addEventListener("click",()=>openBoxMenu(b.dataset.menu)));
}

function openBoxMenu(id){
  const b=activeSpace().boxes.find(x=>x.id===id); if(!b)return;
  openModal(`
    <div class="modal-head"><h2>${esc(b.title||"باکس")}</h2><button class="close-modal">×</button></div>
    <div class="modal-actions" style="margin-top:0">
      <button id="editBox">ویرایش</button>
      <button id="duplicateBox">کپی</button>
      <button id="deleteBox">حذف</button>
    </div>`);
  $("#editBox").onclick=()=>openBoxModal(b);
  $("#duplicateBox").onclick=()=>{activeSpace().boxes.push({...structuredClone(b),id:uid(),title:(b.title||"باکس")+" — کپی"});save();closeModal();render();toast("باکس کپی شد")};
  $("#deleteBox").onclick=()=>{activeSpace().boxes=activeSpace().boxes.filter(x=>x.id!==id);save();closeModal();render();toast("باکس حذف شد")};
}
function openBoxModal(existing=null){
  selectedType=existing?.type||"note";
  openModal(`
    <div class="modal-head"><h2>${existing?"ویرایش باکس":"باکس جدید"}</h2><button class="close-modal">×</button></div>
    <div class="form">
      <div class="field"><label>نوع</label><div class="choice-grid">
        ${["note","task","link","folder"].map(t=>`<button class="type-choice ${selectedType===t?"selected":""}" data-type="${t}"><span>${icon(t)}</span>${typeLabel(t)}</button>`).join("")}
      </div></div>
      <div class="field"><label>عنوان</label><input id="boxTitle" value="${esc(existing?.title||"")}"></div>
      <div id="dynamicFields"></div>
      <div class="modal-actions"><button class="save" id="saveBox">ذخیره</button><button class="close-modal">انصراف</button></div>
    </div>`);
  renderDynamicFields(existing);
  $$("[data-type]").forEach(btn=>btn.onclick=()=>{selectedType=btn.dataset.type;$$("[data-type]").forEach(x=>x.classList.toggle("selected",x===btn));renderDynamicFields(existing)});
  $("#saveBox").onclick=()=>saveBox(existing);
}
function renderDynamicFields(existing){
  const f=$("#dynamicFields");
  if(selectedType==="note") f.innerHTML=`<div class="field"><label>متن</label>
    <div class="editor-tools"><button data-cmd="bold"><b>B</b></button><button data-cmd="italic"><i>I</i></button><button data-cmd="createLink">Link</button><button data-cmd="insertUnorderedList">List</button></div>
    <textarea id="boxContent">${stripTextarea(existing?.content||"")}</textarea></div>`;
  if(selectedType==="task") f.innerHTML=`<div class="field"><label>متن تسک</label><input id="boxContent" value="${esc(existing?.content||"")}"></div>`;
  if(selectedType==="link") f.innerHTML=`<div class="field"><label>آدرس</label><input id="boxContent" type="url" placeholder="https://..." value="${esc(existing?.content||"")}"></div>`;
  if(selectedType==="folder") f.innerHTML=`<div class="field"><label>توضیح پوشه</label><textarea id="boxContent">${esc(existing?.content||"")}</textarea></div>`;
  $$("[data-cmd]").forEach(btn=>btn.onclick=()=>execEditor(btn.dataset.cmd));
}
function stripTextarea(s){return String(s).replace(/<br\s*\/?>/gi,"\n").replace(/<\/p>/gi,"\n").replace(/<[^>]+>/g,"");}
function execEditor(cmd){
  if(cmd==="createLink"){const u=prompt("آدرس لینک:"); if(u) document.execCommand(cmd,false,u)}
  else document.execCommand(cmd,false,null);
}
function saveBox(existing){
  const title=$("#boxTitle").value.trim()||typeLabel(selectedType);
  const content=$("#boxContent").value.trim();
  if(existing){existing.type=selectedType;existing.title=title;existing.content=selectedType==="note"?formatPlainNote(content):content}
  else activeSpace().boxes.push({id:uid(),type:selectedType,title,content:selectedType==="note"?formatPlainNote(content):content,done:false,children:[]});
  save();closeModal();render();toast("ذخیره شد");
}
function formatPlainNote(text){
  const escaped=esc(text).replace(/\n/g,"<br>");
  return escaped;
}

function openSpaceModal(){
  openModal(`<div class="modal-head"><h2>اسپیس جدید</h2><button class="close-modal">×</button></div>
    <div class="form"><div class="field"><label>نام اسپیس</label><input id="spaceName" placeholder="مثلاً Projects"></div>
    <div class="field"><label>توضیح</label><input id="spaceMeta" placeholder="فضای پروژه"></div>
    <div class="modal-actions"><button class="save" id="saveSpace">ساخت اسپیس</button><button class="close-modal">انصراف</button></div></div>`);
  $("#saveSpace").onclick=()=>{
    const name=$("#spaceName").value.trim()||"New Space";
    const s={id:uid(),name,meta:$("#spaceMeta").value.trim()||"فضای جدید",boxes:[]};
    data.spaces.push(s);data.activeSpace=s.id;save();closeModal();render();toast("اسپیس ساخته شد");
  };
}
function openSearch(){
  openModal(`<div class="modal-head"><h2>جست‌وجو</h2><button class="close-modal">×</button></div>
  <div class="field"><input id="globalSearch" placeholder="اسم یا متن باکس..." autofocus></div><div id="results"></div>`);
  const input=$("#globalSearch");
  input.oninput=()=>{
    const q=input.value.trim().toLowerCase(), arr=[];
    data.spaces.forEach(s=>s.boxes.forEach(b=>{
      if(!q || `${s.name} ${b.title} ${b.content}`.toLowerCase().includes(q)) arr.push({s,b});
    }));
    $("#results").innerHTML=arr.length?arr.map(x=>`<div class="search-result" data-go="${x.s.id}:${x.b.id}"><strong>${esc(x.b.title)}</strong><small>${esc(x.s.name)} · ${typeLabel(x.b.type)}</small></div>`).join(""):`<div style="padding:20px;color:#555;text-align:center">چیزی پیدا نشد.</div>`;
    $$("[data-go]").forEach(r=>r.onclick=()=>{const [sid]=r.dataset.go.split(":");data.activeSpace=sid;save();closeModal();render()});
  };
  input.focus();
  input.dispatchEvent(new Event("input"));
}
function openSettings(){
  openModal(`<div class="modal-head"><h2>تنظیمات</h2><button class="close-modal">×</button></div>
  <div class="form">
    <button class="tool-btn" id="exportData">خروجی JSON</button>
    <button class="tool-btn" id="importData">ورود JSON</button>
    <button class="tool-btn" id="resetData">بازنشانی داده‌ها</button>
    <p style="color:#555;font-size:11px;line-height:1.8">داده‌ها فعلاً فقط داخل مرورگر ذخیره می‌شن. برای نسخه‌ی آنلاین چنددستگاهی می‌شه بعداً بک‌اند یا GitHub Sync اضافه کرد.</p>
  </div>`);
  $("#exportData").onclick=exportData;
  $("#importData").onclick=importData;
  $("#resetData").onclick=()=>{if(confirm("همه داده‌ها پاک بشن؟")){localStorage.removeItem(KEY);data=load();closeModal();render();toast("بازنشانی شد")}};
}
function exportData(){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="space-chi-backup.json";a.click();URL.revokeObjectURL(a.href);
}
function importData(){
  const input=document.createElement("input");input.type="file";input.accept=".json,application/json";
  input.onchange=()=>{const file=input.files[0];if(!file)return;const r=new FileReader();r.onload=()=>{try{data=JSON.parse(r.result);save();closeModal();render();toast("بکاپ وارد شد")}catch{toast("فایل نامعتبره")}};r.readAsText(file)};
  input.click();
}
function openModal(html){$("#modal").innerHTML=html;$("#modalBackdrop").classList.add("open");$$(".close-modal").forEach(b=>b.onclick=closeModal)}
function closeModal(){$("#modalBackdrop").classList.remove("open")}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove("show"),1600)}

$("#newSpaceBtn").onclick=openSpaceModal;
$("#addBoxBtn").onclick=()=>openBoxModal();
$("#searchBtn").onclick=openSearch;
$("#mobileMoreBtn").onclick=openSpaceModal;
$("#modalBackdrop").onclick=e=>{if(e.target.id==="modalBackdrop")closeModal()};
$("#expandFolders").onclick=()=>toast("ساختار پوشه‌ها آماده‌ست؛ داخل هر پوشه می‌تونی موارد مرتبط رو نگه داری");
$$(".tool-btn[data-view]").forEach(b=>b.onclick=()=>{data.view=b.dataset.view;save();render()});
$$(".bottom-item").forEach(b=>b.onclick=()=>{
  const a=b.dataset.action;
  if(a==="add")openBoxModal();
  if(a==="search")openSearch();
  if(a==="settings")openSettings();
  if(a==="spaces")window.scrollTo({top:0,behavior:"smooth"});
  $$(".bottom-item").forEach(x=>x.classList.toggle("active",x===b));
});
document.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openSearch()}
  if(e.key==="Escape")closeModal();
});
render();
