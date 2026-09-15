/* ============================================================
   PROJECT TRACKER — upcoming / ongoing / future sales projects.
   Standalone tab: its own tables (tracker_projects, tracker_entries),
   lazy-loaded on first open. Each project moves through a sales
   pipeline (Enquiry → Quoted → Negotiation → Won / Lost / On hold)
   and carries a dated timeline of entries (meetings, quotations,
   calls…), each with PDF/Excel attachments in the shared
   "documents" storage bucket under tracker/.
   ============================================================ */

var TRK_PROJECTS=[],TRK_ENTRIES=[];
var TRK_LOADED=false,TRK_MISSING=false;
var TRK_SEL=null;            /* project id shown in detail view */
var TRK_FSTATUS="",TRK_FOFFICE="";
var TRK_ATT=[];              /* entry-modal attachment staging */

var TRK_STATUSES=["Enquiry","Quoted","Negotiation","Won","Lost","On hold"];
var TRK_ACTIVE_STATUSES=["Enquiry","Quoted","Negotiation"];
var TRK_STATUS_RANK={"Enquiry":0,"Quoted":1,"Negotiation":2,"On hold":3,"Won":4,"Lost":5};
var TRK_OFFICES=["Singapore","Indonesia","China"];

/* ===== converters ===== */
function dbToTrkP(r){return{_id:r.id,name:r.name||"",customer:r.customer||"",country:r.country||"",office:r.office||"",status:r.status||"Enquiry",estValue:(r.est_value===null||r.est_value===undefined)?null:Number(r.est_value),currency:r.currency||"USD",expectedDate:r.expected_date||"",contactName:r.contact_name||"",contactInfo:r.contact_info||"",notes:r.notes||"",createdAt:r.created_at||""};}
function trkPToDb(p){return{name:p.name,customer:p.customer||null,country:p.country||null,office:p.office||null,status:p.status,est_value:(p.estValue===null||isNaN(p.estValue))?null:p.estValue,currency:p.currency||"USD",expected_date:p.expectedDate||null,contact_name:p.contactName||null,contact_info:p.contactInfo||null,notes:p.notes||null};}
function dbToTrkE(r){return{_id:r.id,projectId:r.project_id,date:r.entry_date||"",type:r.entry_type||"Note",title:r.title||"",details:r.details||"",attachments:Array.isArray(r.attachments)?r.attachments:[],createdAt:r.created_at||""};}
function trkEToDb(e){return{project_id:e.projectId,entry_date:e.date||null,entry_type:e.type,title:e.title||null,details:e.details||null,attachments:e.attachments||[]};}

/* ===== helpers ===== */
function trkEsc(s){return String(s===null||s===undefined?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
var TRK_MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function trkFmtDate(d){
  if(!d)return"";
  var dt=new Date(String(d).slice(0,10)+"T00:00:00");
  if(isNaN(dt))return d;
  return dt.getDate()+" "+TRK_MONTHS[dt.getMonth()]+" "+dt.getFullYear();
}
function trkStatusBadge(s){
  var cls={"Enquiry":"trk-s-enquiry","Quoted":"trk-s-quoted","Negotiation":"trk-s-negotiation","Won":"trk-s-won","Lost":"trk-s-lost","On hold":"trk-s-onhold"}[s]||"trk-s-enquiry";
  return "<span class='trk-badge "+cls+"'>"+trkEsc(s)+"</span>";
}
function trkTypeBadge(t){return "<span class='trk-badge trk-type'>"+trkEsc(t)+"</span>";}
function trkValueHtml(p){
  if(p.estValue===null)return"";
  var usd=(p.currency!=="USD"&&typeof fxUsdText==="function")?fxUsdText(p.estValue,p.currency):"";
  return "<span class='trk-value'>"+p.estValue.toLocaleString()+" "+trkEsc(p.currency)+"</span>"+(usd?" <span class='trk-value-usd'>"+usd+"</span>":"");
}
function trkEntriesFor(pid){
  return TRK_ENTRIES.filter(function(e){return e.projectId===pid;})
    .sort(function(a,b){
      var d=(b.date||"").localeCompare(a.date||"");
      return d!==0?d:(b.createdAt||"").localeCompare(a.createdAt||"");
    });
}
/* Flag only when we actually have that country's SVG — the generic "?"
   placeholder looks broken next to new-market countries (Bangladesh…). */
function trkFlag(country,size){
  if(typeof FLAGS==="undefined"||!FLAGS[country])return"";
  return flagImg(country,size);
}
function trkFileIcon(name){
  var n=String(name||"").toLowerCase();
  if(/\.(xls|xlsx|xlsm|csv)$/.test(n))return "&#128202;";   /* 📊 */
  if(/\.pdf$/.test(n))return "&#128196;";                    /* 📄 */
  if(/\.(png|jpe?g|gif|webp)$/.test(n))return "&#128247;";   /* 📷 */
  return "&#128206;";                                        /* 📎 */
}

/* ===== data load (lazy, on first tab open) ===== */
async function trkLoad(force){
  if(TRK_LOADED&&!force)return true;
  var res=await Promise.all([sbGet("tracker_projects"),sbGet("tracker_entries")]);
  if(!res[0]||!res[1]){TRK_MISSING=true;return false;}
  TRK_MISSING=false;
  TRK_PROJECTS=res[0].map(dbToTrkP);
  TRK_ENTRIES=res[1].map(dbToTrkE);
  TRK_LOADED=true;
  return true;
}

/* ===== stats (replaces the customer stat row while on this tab) ===== */
function trkRenderStats(){
  var el=document.getElementById("stats");
  if(!el)return;
  var active=TRK_PROJECTS.filter(function(p){return TRK_ACTIVE_STATUSES.indexOf(p.status)>-1;});
  var quoted=TRK_PROJECTS.filter(function(p){return p.status==="Quoted";}).length;
  var won=TRK_PROJECTS.filter(function(p){return p.status==="Won";});
  var pipeline=0;
  active.forEach(function(p){
    if(p.estValue===null)return;
    var v=(typeof fxToUSD==="function")?fxToUSD(p.estValue,p.currency):(p.currency==="USD"?p.estValue:null);
    if(v!==null)pipeline+=v;
  });
  var wonVal=0;
  won.forEach(function(p){
    if(p.estValue===null)return;
    var v=(typeof fxToUSD==="function")?fxToUSD(p.estValue,p.currency):(p.currency==="USD"?p.estValue:null);
    if(v!==null)wonVal+=v;
  });
  el.innerHTML=
    "<div class='stat'><div class='stat-label'>Active projects</div><div class='stat-value'>"+active.length+"</div><div class='stat-sub'>enquiry &rarr; negotiation</div></div>"+
    "<div class='stat'><div class='stat-label'>Pipeline value</div><div class='stat-value'>"+(typeof fxFormatUSD==="function"?fxFormatUSD(pipeline):"$"+pipeline.toLocaleString())+"</div><div class='stat-sub'>estimated, USD equivalent</div></div>"+
    "<div class='stat'><div class='stat-label'>Quotes outstanding</div><div class='stat-value'>"+quoted+"</div><div class='stat-sub'>waiting on customer</div></div>"+
    "<div class='stat'><div class='stat-label'>Won</div><div class='stat-value'>"+won.length+"</div><div class='stat-sub'>"+(wonVal?(typeof fxFormatUSD==="function"?fxFormatUSD(wonVal):"$"+wonVal.toLocaleString())+" USD equivalent":"projects closed")+"</div></div>";
}

/* ===== main render ===== */
function renderTracker(){
  var content=document.getElementById("content");
  if(!TRK_LOADED){
    content.innerHTML="<div class='empty'>Loading project tracker&hellip;</div>";
    trkLoad().then(function(ok){
      if(currentTab!=="tracker")return;
      if(!ok){
        var st=document.getElementById("stats");if(st)st.innerHTML="";
        content.innerHTML="<div class='empty'>The tracker tables don't exist in Supabase yet (tracker_projects / tracker_entries).<br>Run the setup SQL once in the Supabase SQL editor, then reload.</div>";
        return;
      }
      renderTracker();
    });
    return;
  }
  trkRenderStats();
  if(TRK_SEL&&TRK_PROJECTS.some(function(p){return p._id===TRK_SEL;})){trkRenderDetail();return;}
  TRK_SEL=null;
  trkRenderList();
}

function trkSetStatusFilter(s){TRK_FSTATUS=s;renderTracker();}
function trkSetOfficeFilter(s){TRK_FOFFICE=s;renderTracker();}

function trkRenderList(){
  var chips=[{label:"All",value:""}].concat(TRK_STATUSES.map(function(s){
    var n=TRK_PROJECTS.filter(function(p){return p.status===s;}).length;
    return {label:s+(n?" ("+n+")":""),value:s};
  })).map(function(c){
    return "<button class='trk-chip"+(TRK_FSTATUS===c.value?" active":"")+"' onclick='trkSetStatusFilter(\""+c.value+"\")'>"+trkEsc(c.label)+"</button>";
  }).join("");

  var officeSel="<select class='trk-office-filter' onchange='trkSetOfficeFilter(this.value)'>"+
    "<option value=''"+(TRK_FOFFICE===""?" selected":"")+">All offices</option>"+
    TRK_OFFICES.map(function(o){return "<option"+(TRK_FOFFICE===o?" selected":"")+">"+o+"</option>";}).join("")+
    "</select>";

  var list=TRK_PROJECTS.filter(function(p){
    return (!TRK_FSTATUS||p.status===TRK_FSTATUS)&&(!TRK_FOFFICE||p.office===TRK_FOFFICE);
  }).sort(function(a,b){
    var r=(TRK_STATUS_RANK[a.status]||0)-(TRK_STATUS_RANK[b.status]||0);
    if(r!==0)return r;
    var da=a.expectedDate||"9999",db=b.expectedDate||"9999";
    if(da!==db)return da.localeCompare(db);
    return (b.createdAt||"").localeCompare(a.createdAt||"");
  });

  var cards=list.map(function(p){
    var entries=trkEntriesFor(p._id);
    var last=entries[0];
    var attCount=entries.reduce(function(n,e){return n+(e.attachments?e.attachments.length:0);},0);
    var flag=trkFlag(p.country,16);
    var overdue=p.expectedDate&&TRK_ACTIVE_STATUSES.indexOf(p.status)>-1&&p.expectedDate<new Date().toISOString().slice(0,10);
    return "<div class='trk-card' onclick='trkOpen(\""+p._id+"\")'>"+
      "<div class='trk-card-top'><span class='trk-card-name'>"+trkEsc(p.name)+"</span>"+trkStatusBadge(p.status)+"</div>"+
      ((p.customer||p.country)?"<div class='trk-card-cust'>"+flag+" "+trkEsc(p.customer)+(p.customer&&p.country?" &middot; ":"")+trkEsc(p.country)+"</div>":"")+
      "<div class='trk-card-meta'>"+
        (p.office?"<span class='trk-badge trk-office'>"+trkEsc(p.office)+" office</span>":"")+
        (p.estValue!==null?"<span>"+trkValueHtml(p)+"</span>":"")+
        (p.expectedDate?"<span class='"+(overdue?"trk-overdue":"trk-due")+"'>&#128337; "+trkFmtDate(p.expectedDate)+(overdue?" (overdue)":"")+"</span>":"")+
      "</div>"+
      "<div class='trk-card-foot'>"+
        (last?"Last: "+trkEsc(last.type)+(last.title?" &mdash; "+trkEsc(last.title):"")+" ("+trkFmtDate(last.date)+")":"No activity yet")+
        "<span class='trk-card-counts'>"+entries.length+" entr"+(entries.length===1?"y":"ies")+(attCount?" &middot; &#128206; "+attCount:"")+"</span>"+
      "</div>"+
    "</div>";
  }).join("");

  document.getElementById("content").innerHTML=
    "<div class='trk-toolbar'><div class='trk-chips'>"+chips+"</div>"+officeSel+"</div>"+
    (cards||"<div class='empty'>"+(TRK_PROJECTS.length?"No projects match this filter.":"No projects yet. Click <strong>+ Add entry</strong> to record your first enquiry.")+"</div>");
}

function trkOpen(id){TRK_SEL=id;renderTracker();}
function trkBack(){TRK_SEL=null;renderTracker();}

function trkRenderDetail(){
  var p=TRK_PROJECTS.find(function(x){return x._id===TRK_SEL;});
  if(!p){trkBack();return;}
  var entries=trkEntriesFor(p._id);
  var flag=trkFlag(p.country,18);

  var infoRow=function(label,html){return html?"<div class='trk-info'><div class='trk-info-label'>"+label+"</div><div class='trk-info-val'>"+html+"</div></div>":"";};
  var header=
    "<button class='trk-back' onclick='trkBack()'>&larr; All projects</button>"+
    "<div class='trk-detail-card'>"+
      "<div class='trk-detail-head'>"+
        "<div class='trk-detail-name'>"+trkEsc(p.name)+" "+trkStatusBadge(p.status)+"</div>"+
        "<button class='edit-btn' onclick='trkEditProject()'>Edit project</button>"+
      "</div>"+
      "<div class='trk-info-grid'>"+
        infoRow("Customer",(p.customer?flag+" "+trkEsc(p.customer):""))+
        infoRow("Country",trkEsc(p.country))+
        infoRow("Handling office",p.office?trkEsc(p.office):"")+
        infoRow("Estimated value",p.estValue!==null?trkValueHtml(p):"")+
        infoRow("Expected close",p.expectedDate?trkFmtDate(p.expectedDate):"")+
        infoRow("Contact",trkEsc(p.contactName)+(p.contactInfo?" <span class='trk-value-usd'>"+trkEsc(p.contactInfo)+"</span>":""))+
      "</div>"+
      (p.notes?"<div class='trk-notes'>"+trkEsc(p.notes).replace(/\n/g,"<br>")+"</div>":"")+
    "</div>";

  var tl=entries.map(function(e){
    var atts=(e.attachments||[]).map(function(a){
      return "<a class='trk-att' href='"+trkEsc(a.url)+"' target='_blank' rel='noopener'>"+trkFileIcon(a.name)+" "+trkEsc(a.name)+"</a>";
    }).join("");
    return "<div class='trk-tl-item'><div class='trk-tl-dot'></div><div class='trk-tl-body'>"+
      "<div class='trk-tl-meta'><strong>"+trkFmtDate(e.date)+"</strong> "+trkTypeBadge(e.type)+
        "<a href='#' class='trk-tl-edit' onclick='trkEditEntry(event,\""+e._id+"\")'>Edit</a></div>"+
      (e.title?"<div class='trk-tl-title'>"+trkEsc(e.title)+"</div>":"")+
      (e.details?"<div class='trk-tl-details'>"+trkEsc(e.details).replace(/\n/g,"<br>")+"</div>":"")+
      (atts?"<div class='trk-tl-atts'>"+atts+"</div>":"")+
    "</div></div>";
  }).join("");

  document.getElementById("content").innerHTML=header+
    "<div class='trk-tl-head'><span>Timeline</span>"+
      "<button class='btn-add' onclick='trkOpenEntryModal()'>"+
        "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' style='width:13px;height:13px'><line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/></svg>"+
        " Add entry</button></div>"+
    (tl?"<div class='trk-timeline'>"+tl+"</div>"
       :"<div class='empty'>No timeline entries yet. Record the enquiry, meeting minutes or the quotation you sent.</div>");
}

/* ===== global "+ Add entry" button (toolbar) ===== */
function trkOpenAdd(){
  if(TRK_SEL)trkOpenEntryModal();
  else trkOpenProjectModal();
}

/* ===== project modal ===== */
function trkOpenProjectModal(){
  var m=document.getElementById("modal-trk-project");
  m.removeAttribute("data-edit-id");
  document.getElementById("trk-project-modal-title").textContent="Add project";
  document.getElementById("btn-delete-trk-project").style.display="none";
  m.querySelectorAll("input,textarea").forEach(function(el){el.value="";});
  document.getElementById("tp-office").value="";
  document.getElementById("tp-status").value="Enquiry";
  document.getElementById("tp-currency").value="USD";
  m.classList.add("open");
}
function trkEditProject(){
  var p=TRK_PROJECTS.find(function(x){return x._id===TRK_SEL;});
  if(!p)return;
  var m=document.getElementById("modal-trk-project");
  m.setAttribute("data-edit-id",p._id);
  document.getElementById("trk-project-modal-title").textContent="Edit project";
  document.getElementById("btn-delete-trk-project").style.display="inline-flex";
  document.getElementById("tp-name").value=p.name;
  document.getElementById("tp-customer").value=p.customer;
  document.getElementById("tp-country").value=p.country;
  document.getElementById("tp-office").value=p.office||"";
  document.getElementById("tp-status").value=p.status;
  document.getElementById("tp-value").value=p.estValue===null?"":p.estValue;
  document.getElementById("tp-currency").value=p.currency||"USD";
  document.getElementById("tp-date").value=p.expectedDate?String(p.expectedDate).slice(0,10):"";
  document.getElementById("tp-contact").value=p.contactName;
  document.getElementById("tp-contact-info").value=p.contactInfo;
  document.getElementById("tp-notes").value=p.notes;
  m.classList.add("open");
}
async function trkSaveProject(){
  var name=document.getElementById("tp-name").value.trim();
  if(!name){alert("Please give the project a name.");return;}
  var valRaw=document.getElementById("tp-value").value;
  var p={
    name:name,
    customer:document.getElementById("tp-customer").value.trim(),
    country:document.getElementById("tp-country").value.trim(),
    office:document.getElementById("tp-office").value,
    status:document.getElementById("tp-status").value,
    estValue:valRaw===""?null:parseFloat(valRaw),
    currency:document.getElementById("tp-currency").value,
    expectedDate:document.getElementById("tp-date").value,
    contactName:document.getElementById("tp-contact").value.trim(),
    contactInfo:document.getElementById("tp-contact-info").value.trim(),
    notes:document.getElementById("tp-notes").value.trim()
  };
  var m=document.getElementById("modal-trk-project");
  var editId=m.getAttribute("data-edit-id");
  showLoad("Saving...");
  try{
    if(editId){
      var r1=await fetch(SB_URL+"/rest/v1/tracker_projects?id=eq."+editId,{method:"PATCH",headers:sbH(),body:JSON.stringify(trkPToDb(p))});
      if(!r1.ok)throw new Error("HTTP "+r1.status);
      var idx=TRK_PROJECTS.findIndex(function(x){return x._id===editId;});
      if(idx>-1){p._id=editId;p.createdAt=TRK_PROJECTS[idx].createdAt;TRK_PROJECTS[idx]=p;}
    }else{
      var r=await sbInsert("tracker_projects",trkPToDb(p));
      if(!r||!r[0])throw new Error("insert failed");
      p._id=r[0].id;p.createdAt=r[0].created_at;
      TRK_PROJECTS.push(p);
    }
  }catch(err){hideLoad();alert("Save failed: "+err.message);return;}
  hideLoad();
  closeModal("modal-trk-project");
  renderTracker();
}
async function trkDeleteProject(){
  var m=document.getElementById("modal-trk-project");
  var editId=m.getAttribute("data-edit-id");
  if(!editId)return;
  var p=TRK_PROJECTS.find(function(x){return x._id===editId;});
  if(!confirm("Delete \""+(p?p.name:"this project")+"\" and its whole timeline permanently?"))return;
  showLoad("Deleting...");
  await sbDelete("tracker_projects",editId); /* entries cascade in DB */
  TRK_PROJECTS=TRK_PROJECTS.filter(function(x){return x._id!==editId;});
  TRK_ENTRIES=TRK_ENTRIES.filter(function(e){return e.projectId!==editId;});
  TRK_SEL=null;
  hideLoad();
  closeModal("modal-trk-project");
  renderTracker();
}

/* ===== entry modal ===== */
function trkRenderAttList(){
  var el=document.getElementById("te-att-list");
  if(!el)return;
  el.innerHTML=TRK_ATT.map(function(a,i){
    var name=a.url
      ?"<a href='"+trkEsc(a.url)+"' target='_blank' rel='noopener'>"+trkEsc(a.name)+"</a>"
      :trkEsc(a.name)+" <em>(uploads on save)</em>";
    return "<span class='att-item"+(a.url?"":" att-pending")+"'>"+trkFileIcon(a.name)+" "+name+
      " <a href='#' class='att-remove' title='Remove' onclick='trkRemoveAtt(event,"+i+")'>&#10005;</a></span>";
  }).join("")||"<span class='att-empty'>No files yet. Attach the meeting minutes, quotation PDF or Excel.</span>";
}
function trkAddFiles(){
  var input=document.getElementById("te-files");
  var files=input&&input.files?Array.prototype.slice.call(input.files):[];
  files.forEach(function(f){TRK_ATT.push({name:f.name||"file",file:f});});
  if(input)input.value="";
  trkRenderAttList();
}
function trkRemoveAtt(e,i){
  if(e)e.preventDefault();
  TRK_ATT.splice(i,1);
  trkRenderAttList();
}
async function trkUploadFile(file){
  var safe=(file.name||"file").replace(/[^a-zA-Z0-9._-]/g,"_");
  var path="tracker/"+Date.now()+"-"+safe;
  var r=await fetch(SB_URL+"/storage/v1/object/documents/"+path,{
    method:"POST",
    headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":file.type||"application/octet-stream"},
    body:file
  });
  if(!r.ok)throw new Error("upload failed (HTTP "+r.status+")");
  return SB_URL+"/storage/v1/object/public/documents/"+path;
}
function trkOpenEntryModal(){
  var m=document.getElementById("modal-trk-entry");
  m.removeAttribute("data-edit-id");
  document.getElementById("trk-entry-modal-title").textContent="Add timeline entry";
  document.getElementById("btn-delete-trk-entry").style.display="none";
  document.getElementById("te-date").value=new Date().toISOString().slice(0,10);
  document.getElementById("te-type").value="Meeting";
  document.getElementById("te-title").value="";
  document.getElementById("te-details").value="";
  var fi=document.getElementById("te-files");if(fi)fi.value="";
  TRK_ATT=[];
  trkRenderAttList();
  m.classList.add("open");
}
function trkEditEntry(ev,id){
  if(ev)ev.preventDefault();
  var e=TRK_ENTRIES.find(function(x){return x._id===id;});
  if(!e)return;
  var m=document.getElementById("modal-trk-entry");
  m.setAttribute("data-edit-id",id);
  document.getElementById("trk-entry-modal-title").textContent="Edit timeline entry";
  document.getElementById("btn-delete-trk-entry").style.display="inline-flex";
  document.getElementById("te-date").value=e.date?String(e.date).slice(0,10):"";
  document.getElementById("te-type").value=e.type;
  document.getElementById("te-title").value=e.title;
  document.getElementById("te-details").value=e.details;
  var fi=document.getElementById("te-files");if(fi)fi.value="";
  TRK_ATT=(e.attachments||[]).map(function(a){return{name:a.name,url:a.url};});
  trkRenderAttList();
  m.classList.add("open");
}
async function trkSaveEntry(){
  if(!TRK_SEL){alert("Open a project first.");return;}
  var date=document.getElementById("te-date").value;
  if(!date){alert("Please pick a date.");return;}
  var title=document.getElementById("te-title").value.trim();
  var details=document.getElementById("te-details").value.trim();
  if(!title&&!details&&!TRK_ATT.length){alert("Add a title, some details or a file.");return;}
  /* upload staged files first */
  try{
    var pending=TRK_ATT.filter(function(a){return a.file&&!a.url;});
    for(var i=0;i<pending.length;i++){
      showLoad("Uploading file "+(i+1)+" of "+pending.length+"...");
      pending[i].url=await trkUploadFile(pending[i].file);
      delete pending[i].file;
    }
  }catch(err){hideLoad();alert("File upload failed: "+err.message+"\nEntry was not saved — please try again.");return;}
  var entry={
    projectId:TRK_SEL,
    date:date,
    type:document.getElementById("te-type").value,
    title:title,
    details:details,
    attachments:TRK_ATT.map(function(a){return{name:a.name,url:a.url};})
  };
  var m=document.getElementById("modal-trk-entry");
  var editId=m.getAttribute("data-edit-id");
  showLoad("Saving...");
  try{
    if(editId){
      var r1=await fetch(SB_URL+"/rest/v1/tracker_entries?id=eq."+editId,{method:"PATCH",headers:sbH(),body:JSON.stringify(trkEToDb(entry))});
      if(!r1.ok)throw new Error("HTTP "+r1.status);
      var idx=TRK_ENTRIES.findIndex(function(x){return x._id===editId;});
      if(idx>-1){entry._id=editId;entry.createdAt=TRK_ENTRIES[idx].createdAt;TRK_ENTRIES[idx]=entry;}
    }else{
      var r=await sbInsert("tracker_entries",trkEToDb(entry));
      if(!r||!r[0])throw new Error("insert failed");
      entry._id=r[0].id;entry.createdAt=r[0].created_at;
      TRK_ENTRIES.push(entry);
    }
  }catch(err){hideLoad();alert("Save failed: "+err.message);return;}
  hideLoad();
  closeModal("modal-trk-entry");
  renderTracker();
}
async function trkDeleteEntry(){
  var m=document.getElementById("modal-trk-entry");
  var editId=m.getAttribute("data-edit-id");
  if(!editId)return;
  if(!confirm("Delete this timeline entry permanently?"))return;
  showLoad("Deleting...");
  await sbDelete("tracker_entries",editId);
  TRK_ENTRIES=TRK_ENTRIES.filter(function(x){return x._id!==editId;});
  hideLoad();
  closeModal("modal-trk-entry");
  renderTracker();
}
