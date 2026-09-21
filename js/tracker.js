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
var TRK_CLOSED_STATUSES=["Won","Lost"];
var TRK_STATUS_RANK={"Enquiry":0,"Quoted":1,"Negotiation":2,"On hold":3,"Won":4,"Lost":5};
var TRK_OFFICES=["China","Indonesia","Singapore"];

/* ===== converters ===== */
function dbToTrkP(r){return{_id:r.id,name:r.name||"",customer:r.customer||"",country:r.country||"",office:r.office||"",status:r.status||"Enquiry",products:Array.isArray(r.products)?r.products:[],estValue:(r.est_value===null||r.est_value===undefined)?null:Number(r.est_value),currency:r.currency||"USD",expectedDate:r.expected_date||"",contactName:r.contact_name||"",contactPosition:r.contact_position||"",contactInfo:r.contact_info||"",notes:r.notes||"",createdAt:r.created_at||""};}
function trkPToDb(p){return{name:p.name,customer:p.customer||null,country:p.country||null,office:p.office||null,status:p.status,products:p.products||[],est_value:(p.estValue===null||isNaN(p.estValue))?null:p.estValue,currency:p.currency||"USD",expected_date:p.expectedDate||null,contact_name:p.contactName||null,contact_position:p.contactPosition||null,contact_info:p.contactInfo||null,notes:p.notes||null};}
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
function trkStatusSlug(s){
  return {"Enquiry":"enquiry","Quoted":"quoted","Negotiation":"negotiation","Won":"won","Lost":"lost","On hold":"onhold"}[s]||"enquiry";
}
function trkStatusBadge(s){
  return "<span class='trk-badge trk-s-"+trkStatusSlug(s)+"'>"+trkEsc(s)+"</span>";
}
function trkTypeSlug(t){
  return {"Meeting":"meeting","Quotation":"quotation","Call":"call","Email":"email","Site visit":"site","Note":"note"}[t]||"note";
}
function trkTypeBadge(t){return "<span class='trk-badge trk-type trk-t-"+trkTypeSlug(t)+"'>"+trkEsc(t)+"</span>";}
function trkValueHtml(p){
  if(p.estValue===null)return"";
  var usd=(p.currency!=="USD"&&typeof fxUsdText==="function")?fxUsdText(p.estValue,p.currency):"";
  return "<span class='trk-value'>"+p.estValue.toLocaleString()+" "+trkEsc(p.currency)+"</span>"+(usd?" <span class='trk-value-usd'>"+usd+"</span>":"");
}
/* Newest entry date per project id, in one pass over the entries. */
function trkLastActivityMap(){
  var m={};
  TRK_ENTRIES.forEach(function(e){
    var d=e.date||"";
    if(!m[e.projectId]||d>m[e.projectId])m[e.projectId]=d;
  });
  return m;
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

/* Insert that surfaces the server's reason on failure — a bare "insert
   failed" told the user nothing when a column was missing. */
async function trkInsert(table,row){
  var r=await fetch(SB_URL+"/rest/v1/"+table,{method:"POST",headers:sbH(),body:JSON.stringify(row)});
  if(!r.ok){
    var detail="";try{detail=(await r.text()).slice(0,300);}catch(e){}
    throw new Error("HTTP "+r.status+(detail?" — "+detail:""));
  }
  return r.json();
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

/* The global toolbar "+ Add entry" button doubles as the tracker's add
   button. On the tracker list it creates a project, so relabel it; in the
   detail view the Timeline has its own button, so hide the global one. */
var TRK_BTN_HTML=null;
function trkSyncToolbar(){
  var btn=document.querySelector("#toolbar .btn-add");
  if(!btn)return;
  if(TRK_BTN_HTML===null)TRK_BTN_HTML=btn.innerHTML;
  if(currentTab==="tracker"){
    if(TRK_SEL){btn.style.display="none";}
    else{btn.style.display="";btn.innerHTML=TRK_BTN_HTML.replace("Add entry","Add project");}
  }else{
    btn.style.display="";
    btn.innerHTML=TRK_BTN_HTML;
  }
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
  if(TRK_SEL&&!TRK_PROJECTS.some(function(p){return p._id===TRK_SEL;}))TRK_SEL=null;
  trkSyncToolbar();
  if(TRK_SEL){trkRenderDetail();return;}
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

  /* Most recently active project first — the "Last: …" line on each card
     is what drives the order, so logging an entry brings that project to
     the top. Closed projects (Won/Lost) sink below the live pipeline. */
  var act=trkLastActivityMap();
  function actOf(p){return act[p._id]||(p.createdAt||"").slice(0,10);}
  var list=TRK_PROJECTS.filter(function(p){
    return (!TRK_FSTATUS||p.status===TRK_FSTATUS)&&(!TRK_FOFFICE||p.office===TRK_FOFFICE);
  }).sort(function(a,b){
    var ca=TRK_CLOSED_STATUSES.indexOf(a.status)>-1?1:0;
    var cb=TRK_CLOSED_STATUSES.indexOf(b.status)>-1?1:0;
    if(ca!==cb)return ca-cb;
    var da=actOf(a),db=actOf(b);
    if(da!==db)return db.localeCompare(da);
    return (b.createdAt||"").localeCompare(a.createdAt||"");
  });

  var cards=list.map(function(p){
    var entries=trkEntriesFor(p._id);
    var last=entries[0];
    var attCount=entries.reduce(function(n,e){return n+(e.attachments?e.attachments.length:0);},0);
    var flag=trkFlag(p.country,16);
    var overdue=p.expectedDate&&TRK_ACTIVE_STATUSES.indexOf(p.status)>-1&&p.expectedDate<new Date().toISOString().slice(0,10);
    return "<div class='trk-card trk-sc-"+trkStatusSlug(p.status)+"' onclick='trkOpen(\""+p._id+"\")'>"+
      "<div class='trk-card-top'><span class='trk-card-name'>"+trkEsc(p.name)+"</span>"+trkStatusBadge(p.status)+"</div>"+
      ((p.customer||p.country)?"<div class='trk-card-cust'>"+flag+" "+trkEsc(p.customer)+(p.customer&&p.country?" &middot; ":"")+trkEsc(p.country)+"</div>":"")+
      ((p.products&&p.products.length)?"<div class='trk-card-prods'>"+trkProductChips(p,4)+"</div>":"")+
      "<div class='trk-card-meta'>"+
        (p.office?"<span class='trk-badge trk-office po-of-"+poOfficeSlug(p.office)+"'>"+trkEsc(p.office)+" office</span>":"")+
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
        infoRow("Handling office",p.office?"<span class='trk-badge trk-office po-of-"+poOfficeSlug(p.office)+"'>"+trkEsc(p.office)+" office</span>":"")+
        infoRow("Products of interest",trkProductChips(p))+
        infoRow("Estimated value",p.estValue!==null?trkValueHtml(p):"")+
        infoRow("Expected close",p.expectedDate?trkFmtDate(p.expectedDate):"")+
        infoRow("Contact",trkEsc(p.contactName)+
          (p.contactPosition?" <span class='trk-contact-pos'>&middot; "+trkEsc(p.contactPosition)+"</span>":"")+
          (p.contactInfo?" <span class='trk-value-usd'>"+trkEsc(p.contactInfo)+"</span>":""))+
      "</div>"+
      (p.notes?"<div class='trk-notes'><div class='trk-notes-label'>Project description</div>"+trkEsc(p.notes).replace(/\n/g,"<br>")+"</div>":"")+
    "</div>";

  var tl=entries.map(function(e){
    var atts=(e.attachments||[]).map(function(a){
      return "<a class='trk-att' href='"+trkEsc(a.url)+"' data-name='"+trkEsc(a.name)+"' onclick='return trkViewFile(this)'>"+trkFileIcon(a.name)+" "+trkEsc(a.name)+"</a>";
    }).join("");
    return "<div class='trk-tl-item trk-t-"+trkTypeSlug(e.type)+"'><div class='trk-tl-dot'></div><div class='trk-tl-body'>"+
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
       :"<div class='empty'>No timeline entries yet. Click <strong>+ Add entry</strong> to record the enquiry, meeting minutes or a quotation &mdash; that's also where you attach the PDF / Excel files.</div>");
}

/* ===== in-app file viewer =====
   Clicking an attachment chip previews the file right here instead of
   downloading it: PDFs and images render inline, Excel/CSV are parsed
   with SheetJS (lazy-loaded from the CDN on first use) and shown as
   tables with one tab per sheet. Anything else falls back to a link. */

function trkViewFile(a){
  trkOpenViewer(a.getAttribute("href"),a.getAttribute("data-name")||"");
  return false; /* cancel the default navigation/download */
}
function trkToggleViewSize(){
  var mm=document.querySelector("#modal-trk-view .modal");
  var full=mm.classList.toggle("trk-view-full");
  document.getElementById("trk-view-expand").textContent=full?"Shrink":"Expand";
}
function trkOpenViewer(url,name){
  var m=document.getElementById("modal-trk-view");
  /* each file starts at the normal size */
  var mm=m.querySelector(".modal");
  if(mm)mm.classList.remove("trk-view-full");
  var ex=document.getElementById("trk-view-expand");
  if(ex)ex.textContent="Expand";
  document.getElementById("trk-view-title").textContent=name;
  document.getElementById("trk-view-open").href=url;
  document.getElementById("trk-view-tabs").innerHTML="";
  document.getElementById("trk-view-fzctl").style.display=/\.(xlsx|xlsm|xls|csv)$/i.test(String(name))?"flex":"none";
  var body=document.getElementById("trk-view-body");
  var n=String(name).toLowerCase();
  m.classList.add("open");
  if(/\.pdf$/.test(n)){
    body.innerHTML="<iframe class='trk-view-frame' src='"+trkEsc(url)+"' title='"+trkEsc(name)+"'></iframe>";
  }else if(/\.(png|jpe?g|gif|webp)$/.test(n)){
    body.innerHTML="<img src='"+trkEsc(url)+"' alt='"+trkEsc(name)+"' style='max-width:100%;height:auto;display:block;margin:0 auto'>";
  }else if(/\.(xlsx|xlsm|xls|csv)$/.test(n)){
    body.innerHTML="<div class='empty'>Loading spreadsheet&hellip;</div>";
    trkRenderSpreadsheet(url,name);
  }else{
    body.innerHTML="<div class='empty'>No inline preview for this file type. <a href='"+trkEsc(url)+"' target='_blank' rel='noopener'>Open / download it</a> instead.</div>";
  }
}
function trkLoadScript(src){
  return new Promise(function(res,rej){
    var s=document.createElement("script");
    s.src=src;s.onload=res;
    s.onerror=function(){rej(new Error("could not load the spreadsheet viewer (offline?)"));};
    document.head.appendChild(s);
  });
}
function trkLoadSheetJS(){
  return window.XLSX?Promise.resolve():trkLoadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
}
function trkLoadExcelJS(){
  return window.ExcelJS?Promise.resolve():trkLoadScript("https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js");
}
/* SheetJS (free) gives the displayed VALUES ("USD 220.95") but no styling;
   ExcelJS gives the STYLING (fills, bold, merges via theme) but doesn't
   apply number formats. So: values from SheetJS, colors from ExcelJS. */
var TRK_VIEW_SJS=null,TRK_VIEW_EJS=null,TRK_VIEW_THEME=null;
async function trkRenderSpreadsheet(url,name){
  var body=document.getElementById("trk-view-body");
  try{
    var styled=/\.(xlsx|xlsm)$/i.test(name);
    await Promise.all(styled?[trkLoadSheetJS(),trkLoadExcelJS()]:[trkLoadSheetJS()]);
    var r=await fetch(url);
    if(!r.ok)throw new Error("could not fetch the file (HTTP "+r.status+")");
    var buf=await r.arrayBuffer();
    TRK_VIEW_SJS=XLSX.read(new Uint8Array(buf),{type:"array"});
    TRK_VIEW_EJS=null;TRK_VIEW_THEME=null;
    if(styled){
      try{
        var ewb=new ExcelJS.Workbook();
        await ewb.xlsx.load(buf);
        TRK_VIEW_EJS=ewb;
        TRK_VIEW_THEME=trkParseTheme(ewb);
      }catch(e){/* styling is best-effort — values still render */}
    }
    var tabs=document.getElementById("trk-view-tabs");
    tabs.innerHTML=TRK_VIEW_SJS.SheetNames.length>1
      ?TRK_VIEW_SJS.SheetNames.map(function(sn,i){
        return "<button class='trk-chip' data-sheet='"+i+"' onclick='trkShowSheet("+i+")'>"+trkEsc(sn)+"</button>";
      }).join("")
      :"";
    trkShowSheet(0);
  }catch(err){
    body.innerHTML="<div class='empty'>Preview failed: "+trkEsc(err.message)+"<br><a href='"+trkEsc(url)+"' target='_blank' rel='noopener'>Open / download it</a> instead.</div>";
  }
}
/* Theme palette from the workbook's theme XML. Theme color indexes swap
   the dark/light pairs (0↔1, 2↔3) relative to the XML order — an Excel
   quirk, not a bug here. */
function trkParseTheme(ewb){
  try{
    var xml=ewb.model&&ewb.model.themes&&ewb.model.themes.theme1;
    if(!xml)return null;
    var scheme=xml.match(/<a:clrScheme[\s\S]*?<\/a:clrScheme>/);
    if(!scheme)return null;
    var cols=[],re=/<a:(?:srgbClr val="([0-9A-Fa-f]{6})"|sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")/g,m;
    while((m=re.exec(scheme[0]))&&cols.length<12)cols.push(m[1]||m[2]);
    if(cols.length<10)return null;
    return [cols[1],cols[0],cols[3],cols[2]].concat(cols.slice(4));
  }catch(e){return null;}
}
function trkThemeColor(idx,tint){
  if(!TRK_VIEW_THEME||idx==null||idx>=TRK_VIEW_THEME.length)return null;
  var hex=TRK_VIEW_THEME[idx];
  var r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
  if(tint>0){r=Math.round(r+(255-r)*tint);g=Math.round(g+(255-g)*tint);b=Math.round(b+(255-b)*tint);}
  else if(tint<0){r=Math.round(r*(1+tint));g=Math.round(g*(1+tint));b=Math.round(b*(1+tint));}
  return "rgb("+r+","+g+","+b+")";
}
function trkCellColor(c){
  if(!c)return null;
  if(c.argb)return "#"+(c.argb.length===8?c.argb.slice(2):c.argb);
  if(c.theme!==undefined)return trkThemeColor(c.theme,c.tint||0);
  return null;
}
/* ---- freeze panes ----
   Priority: the freeze the file's author set in Excel; otherwise a guess
   (leading mostly-text columns = labels, leading number-free rows =
   titles/headers); the +/- controls override either for the open sheet. */
var TRK_VIEW_SHEET=0,TRK_VIEW_FZ={cols:1,rows:0};
function trkGuessFreeze(ws,range,es){
  if(es&&es.views&&es.views[0]&&es.views[0].state==="frozen"){
    return {cols:es.views[0].xSplit||0,rows:es.views[0].ySplit||0};
  }
  var maxR=Math.min(range.e.r,range.s.r+80);
  var cols=0;
  for(var c=range.s.c;c<=Math.min(range.s.c+3,range.e.c);c++){
    var num=0,txt=0;
    for(var r=range.s.r;r<=maxR;r++){
      var cell=ws[XLSX.utils.encode_cell({r:r,c:c})];
      if(!cell||cell.v==null||cell.v==="")continue;
      if(cell.t==="n")num++;else txt++;
    }
    if(txt>num&&txt>0)cols++;else break;
  }
  var rows=0;
  for(var r2=range.s.r;r2<=Math.min(range.e.r,range.s.r+4);r2++){
    var hasNum=false,hasAny=false;
    for(var c2=range.s.c;c2<=Math.min(range.e.c,range.s.c+59);c2++){
      var cl=ws[XLSX.utils.encode_cell({r:r2,c:c2})];
      if(cl&&cl.v!=null&&cl.v!==""){hasAny=true;if(cl.t==="n"){hasNum=true;break;}}
    }
    if(hasNum)break;
    rows++;
    if(!hasAny&&rows>2)break; /* stop drifting through blank space */
  }
  return {cols:Math.max(1,Math.min(cols,3)),rows:Math.min(rows,4)};
}
function trkFreezeLabels(){
  var ec=document.getElementById("trk-fz-cols"),er=document.getElementById("trk-fz-rows");
  if(ec)ec.textContent=TRK_VIEW_FZ.cols;
  if(er)er.textContent=TRK_VIEW_FZ.rows;
}
function trkFreezeAdj(which,d){
  TRK_VIEW_FZ[which]=Math.max(0,Math.min(6,TRK_VIEW_FZ[which]+d));
  trkFreezeLabels();
  trkShowSheet(TRK_VIEW_SHEET,true);
}
/* Sticky offsets need real cell widths/heights, so they're measured after
   the table is in the DOM: each frozen column/row cell gets left/top from
   the column's rendered position. */
function trkApplyFreezeOffsets(holder){
  var table=holder.querySelector("table");
  if(!table)return;
  holder.scrollLeft=0;holder.scrollTop=0;
  /* sticky cells are "positioned", so offsetTop/Left would measure from the
     modal, not the table — use rect differences instead */
  var tRect=table.getBoundingClientRect();
  var lefts={},tops={};
  table.querySelectorAll("td[data-fc]").forEach(function(td){
    var j=td.getAttribute("data-fc");
    if(lefts[j]===undefined)lefts[j]=td.getBoundingClientRect().left-tRect.left;
  });
  table.querySelectorAll("td[data-fc]").forEach(function(td){
    td.style.left=(lefts[td.getAttribute("data-fc")]||0)+"px";
  });
  table.querySelectorAll("td[data-fr]").forEach(function(td){
    var j=td.getAttribute("data-fr");
    if(tops[j]===undefined)tops[j]=td.getBoundingClientRect().top-tRect.top;
  });
  table.querySelectorAll("td[data-fr]").forEach(function(td){
    td.style.top=(tops[td.getAttribute("data-fr")]||0)+"px";
  });
}
function trkShowSheet(i,keepFreeze){
  var wb=TRK_VIEW_SJS;
  if(!wb)return;
  TRK_VIEW_SHEET=i;
  document.querySelectorAll("#trk-view-tabs .trk-chip").forEach(function(b){
    b.classList.toggle("active",Number(b.dataset.sheet)===i);
  });
  var body=document.getElementById("trk-view-body");
  var name=wb.SheetNames[i],ws=wb.Sheets[name];
  if(!ws||!ws["!ref"]){body.innerHTML="<div class='empty'>This sheet is empty.</div>";return;}
  var range=XLSX.utils.decode_range(ws["!ref"]);
  var maxR=Math.min(range.e.r,range.s.r+499),maxC=Math.min(range.e.c,range.s.c+59);
  var covered={},span={};
  (ws["!merges"]||[]).forEach(function(m){
    span[m.s.r+"_"+m.s.c]={cs:m.e.c-m.s.c+1,rs:m.e.r-m.s.r+1};
    for(var r=m.s.r;r<=m.e.r;r++)for(var c=m.s.c;c<=m.e.c;c++)
      if(r!==m.s.r||c!==m.s.c)covered[r+"_"+c]=1;
  });
  var es=TRK_VIEW_EJS?TRK_VIEW_EJS.getWorksheet(name):null;
  if(!keepFreeze)TRK_VIEW_FZ=trkGuessFreeze(ws,range,es);
  trkFreezeLabels();
  var fzC=range.s.c+TRK_VIEW_FZ.cols,fzR=range.s.r+TRK_VIEW_FZ.rows;
  var html="<table>";
  for(var r=range.s.r;r<=maxR;r++){
    html+="<tr>";
    for(var c=range.s.c;c<=maxC;c++){
      if(covered[r+"_"+c])continue;
      var cell=ws[XLSX.utils.encode_cell({r:r,c:c})];
      var text=cell?(cell.w!==undefined?cell.w:(cell.v!=null?String(cell.v):"")):"";
      var st="",attrs="";
      var sp=span[r+"_"+c];
      if(sp){
        if(sp.cs>1)attrs+=" colspan='"+sp.cs+"'";
        if(sp.rs>1)attrs+=" rowspan='"+sp.rs+"'";
      }
      try{
        if(es){
          var ec=es.getRow(r+1).getCell(c+1);
          var bg=(ec.fill&&ec.fill.type==="pattern"&&ec.fill.pattern!=="none")?trkCellColor(ec.fill.fgColor):null;
          var fc=ec.font?trkCellColor(ec.font.color):null;
          if(bg)st+="background:"+bg+";";
          /* excel fills are designed for dark-on-light — keep the text dark
             on a colored cell even when the app is in a dark theme */
          if(bg&&!fc)fc="#2a2a2a";
          if(fc)st+="color:"+fc+";";
          if(ec.font&&ec.font.bold)st+="font-weight:600;";
          var al=ec.alignment&&ec.alignment.horizontal;
          if(al&&al!=="fill")st+="text-align:"+al+";";
          else if(cell&&cell.t==="n")st+="text-align:right;";
        }else if(cell&&cell.t==="n")st+="text-align:right;";
      }catch(e){/* style of one cell failing shouldn't kill the table */}
      var cls=[];
      if(c<fzC){cls.push("trk-fz-col");attrs+=" data-fc='"+(c-range.s.c)+"'";}
      if(r<fzR){cls.push("trk-fz-row");attrs+=" data-fr='"+(r-range.s.r)+"'";}
      if(cls.length)attrs+=" class='"+cls.join(" ")+"'";
      html+="<td"+attrs+(st?" style='"+st+"'":"")+">"+trkEsc(text)+"</td>";
    }
    html+="</tr>";
  }
  html+="</table>";
  if(range.e.r>maxR||range.e.c>maxC)html+="<div class='empty'>Large sheet — preview truncated. Use &quot;Open in new tab&quot; for the full file.</div>";
  body.innerHTML="<div class='trk-sheet-holder'>"+html+"</div>";
  trkApplyFreezeOffsets(body);
}

/* ===== global "+ Add entry" button (toolbar) ===== */
function trkOpenAdd(){
  if(TRK_SEL)trkOpenEntryModal();
  else trkOpenProjectModal();
}

/* ===== project modal ===== */
function trkAlpha(a,b){return a.localeCompare(b,undefined,{sensitivity:"base"});}
function trkComboValues(field){
  var vals=TRK_PROJECTS.map(function(p){return p[field];});
  if(field==="customer"&&typeof allDealCustomers==="function")vals=vals.concat(allDealCustomers());
  if(field==="country"&&typeof allDealCountries==="function")vals=vals.concat(allDealCountries());
  var seen={},out=[];
  vals.forEach(function(v){
    v=String(v||"").trim();
    if(!v||seen[v.toLowerCase()])return;
    seen[v.toLowerCase()]=1;out.push(v);
  });
  return out.sort(trkAlpha);
}
/* Type-ahead: plain text input + an app-styled suggestion panel of existing
   values. Replaces both the browser's native datalist dropdown (ugly, and it
   attracted the password manager) and the "+ Add new…" select — typing a
   brand-new value just works. With onPick (multi-value mode, e.g. products),
   choosing or pressing Enter hands the value to onPick instead of filling
   the input. Safe to call repeatedly; wires each input once. */
function trkSuggestInit(inputId,getValues,onPick){
  var inp=document.getElementById(inputId);
  var panel=document.getElementById(inputId+"-suggest");
  if(!inp||!panel||inp._trkSuggest)return;
  inp._trkSuggest=true;
  var idx=-1,items=[];
  function close(){panel.style.display="none";idx=-1;}
  function pick(v){
    if(onPick)onPick(v);else inp.value=v;
    close();
  }
  function render(){
    var q=inp.value.trim().toLowerCase();
    items=getValues().filter(function(v){return !q||v.toLowerCase().indexOf(q)>-1;});
    if(idx>items.length-1)idx=items.length-1;
    /* nothing to suggest, or the input already IS the only match */
    if(!items.length||(!onPick&&items.length===1&&items[0].toLowerCase()===q)){close();return;}
    panel.innerHTML=items.map(function(v,i){
      return "<div class='trk-suggest-item"+(i===idx?" active":"")+"' data-i='"+i+"'>"+trkEsc(v)+"</div>";
    }).join("");
    panel.style.display="block";
    var act=panel.querySelector(".trk-suggest-item.active");
    if(act)act.scrollIntoView({block:"nearest"});
  }
  inp.addEventListener("focus",function(){idx=-1;render();});
  inp.addEventListener("input",function(){idx=-1;render();});
  inp.addEventListener("keydown",function(e){
    var open=panel.style.display!=="none";
    if(e.key==="ArrowDown"&&open){idx=Math.min(idx+1,items.length-1);render();e.preventDefault();}
    else if(e.key==="ArrowUp"&&open){idx=Math.max(idx-1,0);render();e.preventDefault();}
    else if(e.key==="Enter"){
      if(open&&idx>-1){pick(items[idx]);e.preventDefault();}
      else if(onPick&&inp.value.trim()){pick(inp.value.trim());e.preventDefault();}
    }
    else if(e.key==="Escape"&&open){close();}
  });
  inp.addEventListener("blur",function(){setTimeout(close,150);});
  panel.addEventListener("mousedown",function(e){
    var t=e.target.closest(".trk-suggest-item");
    if(!t)return;
    e.preventDefault();
    pick(items[parseInt(t.dataset.i,10)]);
  });
}
function trkInitProjectSuggests(){
  trkSuggestInit("tp-customer",function(){return trkComboValues("customer");});
  trkSuggestInit("tp-country",function(){return trkComboValues("country");});
  trkSuggestInit("tp-product",function(){
    var models=(typeof getModelList==="function"?getModelList():[]).slice().sort(trkAlpha);
    var have=TRK_PROD.map(function(p){return p.toLowerCase();});
    return models.filter(function(m){return have.indexOf(m.toLowerCase())===-1;});
  },function(v){trkAddProduct(v);});
}
/* Products of interest — staged chips, saved as a jsonb string array */
var TRK_PROD=[];
function trkRenderProducts(){
  document.getElementById("tp-products").innerHTML=TRK_PROD.map(function(pr,i){
    return "<span class='att-item'>"+trkEsc(pr)+" <a href='#' class='att-remove' title='Remove' onclick='trkRemoveProduct(event,"+i+")'>&#10005;</a></span>";
  }).join("")||"<span class='att-empty'>Nothing added yet.</span>";
}
function trkAddProduct(v){
  var inp=document.getElementById("tp-product");
  v=String(v!==undefined?v:inp.value).trim();
  if(!v)return;
  if(TRK_PROD.map(function(p){return p.toLowerCase();}).indexOf(v.toLowerCase())===-1)TRK_PROD.push(v);
  inp.value="";
  trkRenderProducts();
}
function trkRemoveProduct(e,i){
  if(e)e.preventDefault();
  TRK_PROD.splice(i,1);
  trkRenderProducts();
}
function trkProductChips(p,max){
  var prods=p.products||[];
  if(!prods.length)return"";
  var shown=max?prods.slice(0,max):prods;
  return shown.map(function(pr){return "<span class='trk-badge trk-prod'>"+trkEsc(pr)+"</span>";}).join(" ")+
    (max&&prods.length>max?" <span class='trk-value-usd'>+"+(prods.length-max)+" more</span>":"");
}
function trkOpenProjectModal(){
  var m=document.getElementById("modal-trk-project");
  m.removeAttribute("data-edit-id");
  document.getElementById("trk-project-modal-title").textContent="Add project";
  document.getElementById("btn-delete-trk-project").style.display="none";
  m.querySelectorAll("input,textarea").forEach(function(el){el.value="";});
  trkInitProjectSuggests();
  TRK_PROD=[];trkRenderProducts();
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
  trkInitProjectSuggests();
  document.getElementById("tp-customer").value=p.customer;
  document.getElementById("tp-country").value=p.country;
  TRK_PROD=(p.products||[]).slice();trkRenderProducts();
  document.getElementById("tp-office").value=p.office||"";
  document.getElementById("tp-status").value=p.status;
  document.getElementById("tp-value").value=p.estValue===null?"":p.estValue;
  document.getElementById("tp-currency").value=p.currency||"USD";
  document.getElementById("tp-date").value=p.expectedDate?String(p.expectedDate).slice(0,10):"";
  document.getElementById("tp-contact").value=p.contactName;
  document.getElementById("tp-position").value=p.contactPosition;
  document.getElementById("tp-contact-info").value=p.contactInfo;
  document.getElementById("tp-notes").value=p.notes;
  m.classList.add("open");
}
async function trkSaveProject(){
  var name=document.getElementById("tp-name").value.trim();
  var customer=document.getElementById("tp-customer").value.trim();
  /* a product typed but never added shouldn't be lost */
  if(document.getElementById("tp-product").value.trim())trkAddProduct();
  if(!name){
    /* Just an enquiry — auto-name it so nothing is required up front. */
    if(!customer){alert("Please pick a customer or give the project a name.");return;}
    name=customer+" enquiry — "+trkFmtDate(new Date().toISOString().slice(0,10));
  }
  var valRaw=document.getElementById("tp-value").value;
  var p={
    name:name,
    customer:customer,
    country:document.getElementById("tp-country").value.trim(),
    office:document.getElementById("tp-office").value,
    status:document.getElementById("tp-status").value,
    products:TRK_PROD.slice(),
    estValue:valRaw===""?null:parseFloat(valRaw),
    currency:document.getElementById("tp-currency").value,
    expectedDate:document.getElementById("tp-date").value,
    contactName:document.getElementById("tp-contact").value.trim(),
    contactPosition:document.getElementById("tp-position").value.trim(),
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
      var r=await trkInsert("tracker_projects",trkPToDb(p));
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
/* Drag & drop onto the open entry modal stages files exactly like the
   file picker. The overlay covers the screen while open, so a drop
   anywhere lands here instead of the browser opening the file. */
(function trkInitDrop(){
  var zone=document.getElementById("modal-trk-entry");
  var box=document.getElementById("te-drop");
  if(!zone)return;
  ["dragenter","dragover"].forEach(function(ev){
    zone.addEventListener(ev,function(e){
      if(!zone.classList.contains("open"))return;
      e.preventDefault();e.stopPropagation();
      if(box)box.classList.add("trk-dragover");
    });
  });
  zone.addEventListener("dragleave",function(e){
    if(!zone.classList.contains("open"))return;
    e.preventDefault();
    if(box&&(!e.relatedTarget||!zone.contains(e.relatedTarget)))box.classList.remove("trk-dragover");
  });
  zone.addEventListener("drop",function(e){
    if(!zone.classList.contains("open"))return;
    e.preventDefault();e.stopPropagation();
    if(box)box.classList.remove("trk-dragover");
    var files=(e.dataTransfer&&e.dataTransfer.files)?Array.prototype.slice.call(e.dataTransfer.files):[];
    files.forEach(function(f){TRK_ATT.push({name:f.name||"file",file:f});});
    if(files.length)trkRenderAttList();
  });
})();
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
      var r=await trkInsert("tracker_entries",trkEToDb(entry));
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
