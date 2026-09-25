/* ============================================================
   PROJECT TRACKER — upcoming / ongoing / future sales projects.
   Standalone tab: its own tables (tracker_projects, tracker_entries),
   lazy-loaded on first open. Each project moves through a sales
   pipeline (Enquiry → Quoted → Won / Lost)
   and carries a dated timeline of entries (meetings, quotations,
   calls…), each with PDF/Excel attachments in the shared
   "documents" storage bucket under tracker/.
   ============================================================ */

var TRK_PROJECTS=[],TRK_ENTRIES=[];
var TRK_LOADED=false,TRK_MISSING=false;
var TRK_SEL=null;            /* project id shown in detail view */
var TRK_FSTATUS="",TRK_FOFFICE="",TRK_FSOL="";
var TRK_ATT=[];              /* entry-modal attachment staging */

/* Pipeline: Enquiry → Quoted → Won / Lost. (Negotiation and On hold
   were retired; legacy projects with those statuses still render.)
   "Other" is a project KIND more than a status: not customer related
   (internal tasks, admin, anything worth a dated timeline). It sits
   outside the pipeline — never derived from entries, never counted in
   the stats — and its filter chip only shows once one exists. */
var TRK_STATUSES=["Enquiry","Quoted","Won","Lost","Other"];
var TRK_ACTIVE_STATUSES=["Enquiry","Quoted"];
var TRK_CLOSED_STATUSES=["Won","Lost"];
var TRK_OFFICES=["China","Indonesia","Singapore"];

/* ===== converters ===== */
function dbToTrkP(r){return{_id:r.id,name:r.name||"",customer:r.customer||"",country:r.country||"",office:r.office||"",status:r.status||"Enquiry",payment:r.payment||"",solution:r.solution||"",products:Array.isArray(r.products)?r.products:[],estValue:(r.est_value===null||r.est_value===undefined)?null:Number(r.est_value),currency:r.currency||"USD",expectedDate:r.expected_date||"",expectedPeriod:r.expected_period||"",contactName:r.contact_name||"",contactPosition:r.contact_position||"",contactInfo:r.contact_info||"",notes:r.notes||"",createdAt:r.created_at||""};}
function trkPToDb(p){return{name:p.name,customer:p.customer||null,country:p.country||null,office:p.office||null,status:p.status,payment:p.payment||null,solution:p.solution||null,products:p.products||[],est_value:(p.estValue===null||isNaN(p.estValue))?null:p.estValue,currency:p.currency||"USD",expected_date:p.expectedDate||null,expected_period:p.expectedPeriod||null,contact_name:p.contactName||null,contact_position:p.contactPosition||null,contact_info:p.contactInfo||null,notes:p.notes||null};}
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
/* ===== expected close periods =====
   Stored as "2026-Q3" or "2026-12" in expected_period; expected_date
   is kept at the period's LAST day so overdue checks keep working.
   Projects saved before periods existed may have only a date. */
var TRK_Q_END={Q1:"03-31",Q2:"06-30",Q3:"09-30",Q4:"12-31"};
function trkPeriodEnd(per){
  var m=/^(\d{4})-(Q[1-4])$/.exec(per);
  if(m)return m[1]+"-"+TRK_Q_END[m[2]];
  m=/^(\d{4})-(\d{2})$/.exec(per);
  if(m)return m[1]+"-"+m[2]+"-"+("0"+new Date(+m[1],+m[2],0).getDate()).slice(-2);
  return"";
}
function trkPeriodLabel(p){
  var m=/^(\d{4})-(Q[1-4])$/.exec(p.expectedPeriod||"");
  if(m)return m[2]+" "+m[1];
  m=/^(\d{4})-(\d{2})$/.exec(p.expectedPeriod||"");
  if(m)return TRK_MONTHS[+m[2]-1]+" "+m[1];
  return p.expectedDate?trkFmtDate(p.expectedDate):"";
}
function trkStatusSlug(s){
  return {"Enquiry":"enquiry","Quoted":"quoted","Negotiation":"negotiation","Won":"won","Lost":"lost","On hold":"onhold","Other":"other"}[s]||"enquiry";
}
function trkStatusBadge(s){
  return "<span class='trk-badge trk-s-"+trkStatusSlug(s)+"'>"+trkEsc(s)+"</span>";
}
/* Payment progress badge, shown on Won projects only. An unset value
   means nothing has been received yet. */
var TRK_PAYMENTS=["Not paid","Partially paid","Fully paid"];
function trkPaymentBadge(p){
  if(p.status!=="Won")return"";
  var pay=p.payment||"Not paid";
  var slug={"Not paid":"not","Partially paid":"partial","Fully paid":"paid"}[pay]||"not";
  return " <span class='trk-badge trk-pay-"+slug+"'>"+trkEsc(pay)+"</span>";
}
/* ===== solution / product-type tag =====
   One small tag saying WHAT the project is about — Custom (printers),
   Posiva, Fire fighting… Free text with type-ahead so a new category
   needs no code change: the known ones get a curated dot color, any
   new one a stable hashed hue (same trick as the country colors). */
var TRK_SOLUTIONS=["Custom","Posiva","Fire fighting","Others"];
var TRK_SOLUTION_COLORS={
  "Custom":"#1d4ed8",        /* blue */
  "Posiva":"#7c3aed",        /* violet */
  "Fire fighting":"#dc2626", /* red, obviously */
  "Others":"#6b7280"         /* gray — the catch-all bucket */
};
function trkSolutionColor(s){
  if(TRK_SOLUTION_COLORS[s])return TRK_SOLUTION_COLORS[s];
  var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;
  return "hsl("+(h%360)+",60%,45%)";
}
function trkSolutionBadge(p){
  if(!p.solution)return"";
  return "<span class='trk-badge trk-sol'><span class='trk-sol-dot' style='background:"+trkSolutionColor(p.solution)+"'></span>"+trkEsc(p.solution)+"</span>";
}
/* Suggestion vocabulary: the seed list plus anything already tagged. */
function trkSolutionValues(){
  var seen={},out=[];
  TRK_SOLUTIONS.concat(TRK_PROJECTS.map(function(p){return p.solution;})).forEach(function(v){
    v=String(v||"").trim();
    if(v&&!seen[v.toLowerCase()]){seen[v.toLowerCase()]=1;out.push(v);}
  });
  return out.sort(trkAlpha);
}
function trkTypeSlug(t){
  return {"Meeting":"meeting","Quotation":"quotation","Purchase order":"po","Invoice":"invoice","Payment received":"payment","Call":"call","Email":"email","WhatsApp":"whatsapp","Site visit":"site","Note":"note"}[t]||"note";
}
function trkTypeBadge(t){return "<span class='trk-badge trk-type trk-t-"+trkTypeSlug(t)+"'>"+trkEsc(t)+"</span>";}
function trkValueHtml(p){
  if(p.estValue===null)return"";
  var usd=(p.currency!=="USD"&&typeof fxUsdText==="function")?fxUsdText(p.estValue,p.currency):"";
  return "<span class='trk-value'>"+p.estValue.toLocaleString()+" "+trkEsc(p.currency)+"</span>"+(usd?" <span class='trk-value-usd'>"+usd+"</span>":"");
}
/* Newest entry per project id, in one pass over the entries. Keeps the
   entry's created_at alongside its date so two entries on the same day
   can still be ordered by which was logged last. */
function trkLastActivityMap(){
  var m={};
  TRK_ENTRIES.forEach(function(e){
    var k={d:e.date||"",c:e.createdAt||""};
    var cur=m[e.projectId];
    if(!cur||k.d>cur.d||(k.d===cur.d&&k.c>cur.c))m[e.projectId]=k;
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
/* Flag only when we can actually draw one (hand-drawn SVG or a known
   ISO code for the CDN fallback) — the generic "?" placeholder looks
   broken next to unrecognized country names. */
function trkFlag(country,size){
  if(typeof FLAGS!=="undefined"&&FLAGS[country])return flagImg(country,size);
  if(typeof countryCode==="function"&&countryCode(country))return flagImg(country,size);
  return"";
}

/* ===== per-country card colors (left edge) =====
   Curated colors for the main markets — aligned with the office badge
   colors where country and office coincide — plus a stable hashed hue
   for any new country, so color coding needs no upkeep. */
var TRK_COUNTRY_COLORS={
  "China":"#b91c1c",        /* red — matches China office */
  "Indonesia":"#b45309",    /* gold — matches Indonesia office */
  "Singapore":"#1d4ed8",    /* blue — matches Singapore office */
  "Philippines":"#0d9488",  /* teal */
  "Bangladesh":"#15803d",   /* green */
  "India":"#ea580c",        /* orange */
  "Thailand":"#7c3aed",     /* violet */
  "Vietnam":"#0891b2",      /* cyan */
  "Malaysia":"#4f46e5",     /* indigo */
  "Italy":"#16a34a"         /* green */
};
function trkCountryColor(c){
  if(!c)return"";
  if(TRK_COUNTRY_COLORS[c])return TRK_COUNTRY_COLORS[c];
  var h=0;for(var i=0;i<c.length;i++)h=(h*31+c.charCodeAt(i))>>>0;
  return "hsl("+(h%360)+",60%,45%)";
}

/* ===== title date suffix =====
   Cards show "Name — 7 Sep 2026" using the project's earliest entry
   date (fallback: creation date), unless the name already contains a
   date of its own. */
var TRK_DATE_IN_NAME=/\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\d{4}-\d{2}|\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}/i;
function trkFirstDate(p){
  var d=null;
  TRK_ENTRIES.forEach(function(e){
    if(e.projectId===p._id&&e.date&&(!d||e.date<d))d=e.date;
  });
  return d||(p.createdAt||"").slice(0,10);
}
function trkDisplayName(p){return trkEsc(p.name);}
/* The project's own start date, shown beside customer and country. Blank
   when the name already spells a date out, so it is never said twice. */
function trkProjectDate(p){
  if(TRK_DATE_IN_NAME.test(p.name))return"";
  var d=trkFirstDate(p);
  return d?trkFmtDate(d):"";
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
    "<div class='stat'><div class='stat-label'>Active projects</div><div class='stat-value'>"+active.length+"</div><div class='stat-sub'>enquiry &rarr; quoted</div></div>"+
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

/* Status is DERIVED from the timeline, not edited by hand:
   Purchase order / Payment received ⇒ Won, Quotation ⇒ Quoted,
   nothing ⇒ Enquiry. "Lost" is the one manual flag (set from the
   editor's Mark-as-lost button) and is never derived away. The pass
   runs on every tracker render, so adding, editing or deleting
   entries keeps statuses correct with no extra bookkeeping. */
function trkDerivedStatus(p){
  if(p.status==="Lost")return "Lost";
  if(p.status==="Other")return "Other"; /* outside the pipeline */
  var won=false,quoted=false;
  TRK_ENTRIES.forEach(function(e){
    if(e.projectId!==p._id)return;
    if(e.type==="Purchase order"||e.type==="Payment received")won=true;
    else if(e.type==="Quotation")quoted=true;
  });
  return won?"Won":(quoted?"Quoted":"Enquiry");
}
function trkReconcileStatus(){
  TRK_PROJECTS.forEach(function(p){
    var s=trkDerivedStatus(p);
    if(p.status===s)return;
    p.status=s;
    fetch(SB_URL+"/rest/v1/tracker_projects?id=eq."+p._id,{method:"PATCH",headers:sbH(),body:JSON.stringify({status:s})})
      .catch(function(err){console.error("Status reconcile failed:",err);});
  });
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
  trkReconcileStatus();
  trkRenderStats();
  if(TRK_SEL&&!TRK_PROJECTS.some(function(p){return p._id===TRK_SEL;}))TRK_SEL=null;
  trkSyncToolbar();
  if(TRK_SEL){trkRenderDetail();return;}
  trkRenderList();
}

function trkSetStatusFilter(s){TRK_FSTATUS=s;renderTracker();}
function trkSetOfficeFilter(s){TRK_FOFFICE=s;renderTracker();}
function trkSetSolutionFilter(s){TRK_FSOL=s;renderTracker();}

function trkRenderList(){
  var chips=[{label:"All",value:""}].concat(TRK_STATUSES.map(function(s){
    var n=TRK_PROJECTS.filter(function(p){return p.status===s;}).length;
    if(s==="Other"&&!n)return null; /* chip appears once one exists */
    return {label:(s==="Other"?"Others":s)+(n?" ("+n+")":""),value:s};
  }).filter(Boolean)).map(function(c){
    return "<button class='trk-chip"+(TRK_FSTATUS===c.value?" active":"")+"' onclick='trkSetStatusFilter(\""+c.value+"\")'>"+trkEsc(c.label)+"</button>";
  }).join("");

  var officeSel="<select class='trk-office-filter' onchange='trkSetOfficeFilter(this.value)'>"+
    "<option value=''"+(TRK_FOFFICE===""?" selected":"")+">All offices</option>"+
    TRK_OFFICES.map(function(o){return "<option"+(TRK_FOFFICE===o?" selected":"")+">"+o+"</option>";}).join("")+
    "</select>";

  /* Solution filter only appears once at least one project is tagged. */
  var solsUsed={};
  TRK_PROJECTS.forEach(function(p){var v=String(p.solution||"").trim();if(v)solsUsed[v]=1;});
  var solList=Object.keys(solsUsed).sort(trkAlpha);
  var solSel=solList.length?"<select class='trk-office-filter' onchange='trkSetSolutionFilter(this.value)'>"+
    "<option value=''"+(TRK_FSOL===""?" selected":"")+">All solutions</option>"+
    solList.map(function(s){return "<option"+(TRK_FSOL===s?" selected":"")+">"+trkEsc(s)+"</option>";}).join("")+
    "</select>":"";

  /* Most recently active project first — the "Last: …" line on each card
     is what drives the order, so logging an entry brings that project to
     the top. Closed projects (Won/Lost) sink below the live pipeline. */
  var act=trkLastActivityMap();
  function actOf(p){return act[p._id]||{d:(p.createdAt||"").slice(0,10),c:p.createdAt||""};}
  var list=TRK_PROJECTS.filter(function(p){
    return (!TRK_FSTATUS||p.status===TRK_FSTATUS)&&(!TRK_FOFFICE||p.office===TRK_FOFFICE)&&(!TRK_FSOL||p.solution===TRK_FSOL);
  }).sort(function(a,b){
    var ca=TRK_CLOSED_STATUSES.indexOf(a.status)>-1?1:0;
    var cb=TRK_CLOSED_STATUSES.indexOf(b.status)>-1?1:0;
    if(ca!==cb)return ca-cb;
    var da=actOf(a),db=actOf(b);
    if(da.d!==db.d)return db.d.localeCompare(da.d);
    if(da.c!==db.c)return db.c.localeCompare(da.c);
    return (b.createdAt||"").localeCompare(a.createdAt||"");
  });

  function cardHtml(p){
    var entries=trkEntriesFor(p._id);
    var last=entries[0];
    var attCount=entries.reduce(function(n,e){return n+(e.attachments?e.attachments.length:0);},0);
    var flag=trkFlag(p.country,16);
    var overdue=p.expectedDate&&TRK_ACTIVE_STATUSES.indexOf(p.status)>-1&&p.expectedDate<new Date().toISOString().slice(0,10);
    /* Edge color follows the handling office (same colors as the office
       badges: China red, Singapore blue, Indonesia yellow); projects
       without an office fall back to their country's color. */
    var edge=p.office?"":trkCountryColor(p.country);
    /* Customer, country and the project's own start date share one line,
       so the heading is just the project name. */
    var pdate=trkProjectDate(p);
    var custLine=[trkEsc(p.customer),trkEsc(p.country),pdate?"<span class='trk-card-date'>"+pdate+"</span>":""]
      .filter(Boolean).join(" &middot; ");
    if(custLine&&flag)custLine=flag+" "+custLine;
    return "<div class='trk-card trk-sc-"+trkStatusSlug(p.status)+(p.office?" po-of-"+poOfficeSlug(p.office):"")+"'"+(edge?" style='border-left-color:"+edge+"'":"")+" onclick='trkOpen(\""+p._id+"\")'>"+
      "<div class='trk-card-top'><span class='trk-card-name'>"+trkDisplayName(p)+"</span><span style='white-space:nowrap'>"+trkStatusBadge(p.status)+trkPaymentBadge(p)+"</span></div>"+
      (custLine?"<div class='trk-card-cust'>"+custLine+"</div>":"")+
      ((p.products&&p.products.length)?"<div class='trk-card-prods'>"+trkProductChips(p,4)+"</div>":"")+
      "<div class='trk-card-meta'>"+
        trkSolutionBadge(p)+
        (p.office?"<span class='trk-badge trk-office po-of-"+poOfficeSlug(p.office)+"'>"+trkEsc(p.office)+" office</span>":"")+
        (p.estValue!==null?"<span>"+trkValueHtml(p)+"</span>":"")+
        ((p.expectedPeriod||p.expectedDate)?"<span class='"+(overdue?"trk-overdue":"trk-due")+"'>&#128337; "+trkPeriodLabel(p)+(overdue?" (overdue)":"")+"</span>":"")+
      "</div>"+
      "<div class='trk-card-foot'>"+
        "<span class='trk-card-last'>"+(last?"<span class='trk-card-when'>"+trkFmtDate(last.date)+"</span> &middot; "+trkEsc(last.type)+(last.title?" &mdash; "+trkEsc(last.title):""):"No activity yet")+"</span>"+
        "<span class='trk-card-counts'>"+entries.length+" entr"+(entries.length===1?"y":"ies")+(attCount?" &middot; &#128206; "+attCount:"")+"</span>"+
      "</div>"+
    "</div>";
  }

  /* ===== solution groups =====
     Once anything is tagged, cards sit under small solution headers
     (Custom, Posiva, Fire fighting, Others…), untagged projects last.
     The flat list remains when nothing is tagged yet or the solution
     filter already narrows the list to one group. */
  var cards;
  if(TRK_FSOL||!list.some(function(p){return p.solution;})){
    cards=list.map(cardHtml).join("");
  }else{
    var order=TRK_SOLUTIONS.slice(),extra=[];
    list.forEach(function(p){
      var s=p.solution;
      if(s&&order.indexOf(s)===-1&&extra.indexOf(s)===-1)extra.push(s);
    });
    order=order.concat(extra.sort(trkAlpha));
    order.push(""); /* untagged bucket last */
    cards=order.map(function(s){
      var grp=list.filter(function(p){return (p.solution||"")===s;});
      if(!grp.length)return"";
      return "<div class='trk-group-head"+(s?"":" trk-group-untagged")+"'>"+
        (s?"<span class='trk-sol-dot' style='background:"+trkSolutionColor(s)+"'></span>"+trkEsc(s):"No tag yet")+
        "<span class='trk-group-count'>"+grp.length+"</span></div>"+
        grp.map(cardHtml).join("");
    }).join("");
  }

  document.getElementById("content").innerHTML=
    "<div class='trk-toolbar'><div class='trk-chips'>"+chips+"</div>"+solSel+officeSel+"</div>"+
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
        "<div class='trk-detail-name'>"+trkDisplayName(p)+" "+trkStatusBadge(p.status)+trkPaymentBadge(p)+"</div>"+
        "<button class='edit-btn' onclick='trkEditProject()'>Edit project</button>"+
      "</div>"+
      "<div class='trk-info-grid'>"+
        infoRow("Customer",(p.customer?flag+" "+trkEsc(p.customer):""))+
        infoRow("Country",trkEsc(p.country))+
        infoRow("Project date",trkProjectDate(p))+
        infoRow("Handling office",p.office?"<span class='trk-badge trk-office po-of-"+poOfficeSlug(p.office)+"'>"+trkEsc(p.office)+" office</span>":"")+
        infoRow("Solution type",trkSolutionBadge(p))+
        infoRow("Products of interest",trkProductChips(p))+
        infoRow("Estimated value",p.estValue!==null?trkValueHtml(p):"")+
        infoRow("Expected close",trkPeriodLabel(p))+
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
  trkSuggestInit("tp-solution",trkSolutionValues);
  trkSuggestInit("tp-product",function(){
    /* Vocabulary = the master model list PLUS products free-typed on any
       tracker project (qty prefixes like "79× " stripped), minus what's
       already on this project. */
    function bare(s){return String(s||"").replace(/^\s*\d+\s*[x×]\s*/i,"").trim();}
    var seen={},list=[];
    function add(name){
      var b=bare(name);
      if(b&&!seen[b.toLowerCase()]){seen[b.toLowerCase()]=true;list.push(b);}
    }
    (typeof getModelList==="function"?getModelList():[]).forEach(add);
    TRK_PROJECTS.forEach(function(p){(p.products||[]).forEach(add);});
    var have={};
    TRK_PROD.forEach(function(p){have[bare(p).toLowerCase()]=true;});
    return list.filter(function(m){return !have[m.toLowerCase()];}).sort(trkAlpha);
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
  var qEl=document.getElementById("tp-product-qty");
  v=String(v!==undefined?v:inp.value).trim();
  if(!v)return;
  var q=qEl?qEl.value.trim():"";
  if(q)v=q+"× "+v;                       /* "50× TK180" */
  if(TRK_PROD.map(function(p){return p.toLowerCase();}).indexOf(v.toLowerCase())===-1)TRK_PROD.push(v);
  inp.value="";
  if(qEl)qEl.value="";
  trkRenderProducts();
  trkAutoName();
}
function trkRemoveProduct(e,i){
  if(e)e.preventDefault();
  TRK_PROD.splice(i,1);
  trkRenderProducts();
  trkAutoName();
}

/* ===== auto project name =====
   Standard format: "Customer — 50× Model" (the card appends the first
   entry date on its own). The name field live-fills from the customer
   and product fields, but stops as soon as the user types their own
   name; it resumes if they clear the field. */
function trkComposedName(){
  var cEl=document.getElementById("tp-customer");
  var customer=cEl?cEl.value.trim():"";
  var prods=TRK_PROD.slice(0,3).join(", ")+(TRK_PROD.length>3?" +"+(TRK_PROD.length-3):"");
  if(!customer)return TRK_PROD.length?prods:"";
  return customer+(TRK_PROD.length?" — "+prods:"");
}
var TRK_NAME_AUTO="";
function trkAutoName(){
  var el=document.getElementById("tp-name");
  if(!el)return;
  var cur=el.value.trim();
  if(cur&&cur!==TRK_NAME_AUTO)return;       /* user wrote their own */
  TRK_NAME_AUTO=trkComposedName();
  el.value=TRK_NAME_AUTO;
}
/* The "↻ Auto" button: regenerate the name from the current fields.
   Setting the field to the composed value also re-arms live auto-fill
   (a hand-written name normally switches it off). */
function trkResetAutoName(){
  TRK_NAME_AUTO=trkComposedName();
  document.getElementById("tp-name").value=TRK_NAME_AUTO;
}
(function trkWireAutoName(){
  var c=document.getElementById("tp-customer");
  if(!c)return;
  c.addEventListener("input",trkAutoName);
  c.addEventListener("blur",trkAutoName);   /* suggest clicks set the value programmatically */
})();
function trkProductChips(p,max){
  var prods=p.products||[];
  if(!prods.length)return"";
  var shown=max?prods.slice(0,max):prods;
  return shown.map(function(pr){return "<span class='trk-badge trk-prod'>"+trkEsc(pr)+"</span>";}).join(" ")+
    (max&&prods.length>max?" <span class='trk-value-usd'>+"+(prods.length-max)+" more</span>":"");
}
/* ===== project kind =====
   "Customer" (the default sales pipeline) or "Other" (not customer
   related — internal tasks, admin, anything). Other hides every
   customer/deal/contact field and stores the project with the fixed
   status "Other", so the modal's toggle is the only place the kind is
   chosen; it round-trips through the status column, no schema change. */
var TRK_KIND="Customer";
function trkSetKind(k){
  TRK_KIND=k;
  var other=k==="Other";
  document.getElementById("tp-kind-customer").classList.toggle("active",!other);
  document.getElementById("tp-kind-other").classList.toggle("active",other);
  document.querySelectorAll("#modal-trk-project .tp-cust-only").forEach(function(el){
    el.style.display=other?"none":"";
  });
  document.getElementById("tp-name-hint").style.display=other?"none":"";
  document.getElementById("tp-name-auto").style.display=other?"none":"";
  document.getElementById("tp-kind-hint").style.display=other?"":"none";
  document.getElementById("tp-name").placeholder=other
    ?"e.g. Office renovation — contractor updates"
    :"e.g. Biman — 50× TK180 — boarding pass printers";
  if(other)trkSyncPaymentVis("Other"); /* payment row is Won-only */
}
function trkOpenProjectModal(){
  var m=document.getElementById("modal-trk-project");
  m.removeAttribute("data-edit-id");
  document.getElementById("trk-project-modal-title").textContent="Add project";
  document.getElementById("btn-delete-trk-project").style.display="none";
  m.querySelectorAll("input,textarea").forEach(function(el){el.value="";});
  trkInitProjectSuggests();
  TRK_PROD=[];trkRenderProducts();
  TRK_NAME_AUTO="";
  trkSetKind("Customer");
  document.getElementById("tp-office").value="";
  document.getElementById("tp-close-period").value="";
  trkSetStatusDisplay("Enquiry");
  trkSetPaymentDisplay("");
  trkSyncPaymentVis("Enquiry");
  document.getElementById("btn-lost-trk-project").style.display="none";
  document.getElementById("tp-currency").value="USD";
  m.classList.add("open");
}
/* the Payment field only applies to Won projects */
function trkSyncPaymentVis(status){
  var wrap=document.getElementById("tp-payment-wrap");
  if(wrap)wrap.style.display=status==="Won"?"":"none";
}
/* Status is read-only in the editor — the timeline drives it. */
function trkSetStatusDisplay(status){
  var el=document.getElementById("tp-status-display");
  if(!el)return;
  el.innerHTML=trkStatusBadge(status)+
    " <span style='font-size:10.5px;color:var(--text-faint)'>from the timeline &mdash; quotation &rArr; Quoted, purchase order &rArr; Won</span>";
}
/* Mark as lost / Reopen — the only manual status action. Reopening
   re-derives from the timeline. */
async function trkToggleLost(){
  var m=document.getElementById("modal-trk-project");
  var id=m.getAttribute("data-edit-id");
  var p=TRK_PROJECTS.find(function(x){return x._id===id;});
  if(!p)return;
  if(p.status==="Lost"){p.status="Enquiry";p.status=trkDerivedStatus(p);}
  else p.status="Lost";
  showLoad("Saving...");
  try{
    await fetch(SB_URL+"/rest/v1/tracker_projects?id=eq."+p._id,{method:"PATCH",headers:sbH(),body:JSON.stringify({status:p.status})});
  }catch(err){console.error("Status update failed:",err);}
  hideLoad();
  closeModal("modal-trk-project");
  renderTracker();
}
/* Payment is read-only here — it is driven by "Payment received"
   timeline entries, so the modal just shows the current state. */
function trkSetPaymentDisplay(pay){
  var el=document.getElementById("tp-payment-display");
  if(!el)return;
  el.innerHTML=trkPaymentBadge({status:"Won",payment:pay})+
    " <span style='font-size:10.5px;color:var(--text-faint)'>set by &ldquo;Payment received&rdquo; entries in the timeline</span>";
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
  trkSetKind(p.status==="Other"?"Other":"Customer");
  document.getElementById("tp-customer").value=p.customer;
  document.getElementById("tp-country").value=p.country;
  document.getElementById("tp-solution").value=p.solution||"";
  TRK_PROD=(p.products||[]).slice();trkRenderProducts();
  /* if the stored name matches the composed format, keep it in sync
     with later customer/product edits; a custom name stays untouched */
  TRK_NAME_AUTO=trkComposedName();
  document.getElementById("tp-office").value=p.office||"";
  trkSetStatusDisplay(p.status);
  trkSetPaymentDisplay(p.payment);
  trkSyncPaymentVis(p.status);
  var lostBtn=document.getElementById("btn-lost-trk-project");
  lostBtn.style.display=p.status==="Other"?"none":"inline-flex"; /* no pipeline to lose */
  lostBtn.textContent=p.status==="Lost"?"Reopen project":"Mark as lost";
  document.getElementById("tp-value").value=p.estValue===null?"":p.estValue;
  document.getElementById("tp-currency").value=p.currency||"USD";
  /* period picker: prefer the stored period; legacy date-only projects
     load as their month */
  var perM=/^(\d{4})-(Q[1-4]|\d{2})$/.exec(p.expectedPeriod||"");
  if(perM){
    document.getElementById("tp-close-period").value=perM[2];
    document.getElementById("tp-close-year").value=perM[1];
  }else if(p.expectedDate){
    document.getElementById("tp-close-period").value=String(p.expectedDate).slice(5,7);
    document.getElementById("tp-close-year").value=String(p.expectedDate).slice(0,4);
  }else{
    document.getElementById("tp-close-period").value="";
    document.getElementById("tp-close-year").value="";
  }
  document.getElementById("tp-contact").value=p.contactName;
  document.getElementById("tp-position").value=p.contactPosition;
  document.getElementById("tp-contact-info").value=p.contactInfo;
  document.getElementById("tp-notes").value=p.notes;
  m.classList.add("open");
}
async function trkSaveProject(){
  var other=TRK_KIND==="Other";
  var name=document.getElementById("tp-name").value.trim();
  var customer=document.getElementById("tp-customer").value.trim();
  /* a product typed but never added shouldn't be lost */
  if(!other&&document.getElementById("tp-product").value.trim())trkAddProduct();
  if(!name){
    /* Standard auto-name; the card appends the first entry date itself. */
    name=other?"":trkComposedName();
    if(!name){alert(other?"Please give it a name.":"Please pick a customer or give the project a name.");return;}
  }
  var valRaw=document.getElementById("tp-value").value;
  /* payment is owned by "Payment received" entries — carry it over
     untouched when editing, start empty on a new project */
  var mEl=document.getElementById("modal-trk-project");
  var prevId=mEl.getAttribute("data-edit-id");
  var prev=prevId?TRK_PROJECTS.find(function(x){return x._id===prevId;}):null;
  /* An Other project keeps none of the customer/deal fields — switching
     kind on an existing project deliberately clears them. Its status is
     the fixed "Other"; switching back to Customer starts at Enquiry and
     the reconcile pass re-derives from the timeline on the next render. */
  var p={
    name:name,
    customer:other?"":customer,
    country:other?"":document.getElementById("tp-country").value.trim(),
    office:document.getElementById("tp-office").value,
    solution:document.getElementById("tp-solution").value.trim(), /* applies to Other too — e.g. fire fighting */
    status:other?"Other":(prev&&prev.status!=="Other"?prev.status:"Enquiry"),
    payment:prev?(prev.payment||""):"",
    products:other?[]:TRK_PROD.slice(),
    estValue:(other||valRaw==="")?null:parseFloat(valRaw),
    currency:document.getElementById("tp-currency").value,
    expectedPeriod:other?"":(function(){
      var per=document.getElementById("tp-close-period").value;
      var yr=document.getElementById("tp-close-year").value.trim();
      return (per&&/^\d{4}$/.test(yr))?yr+"-"+per:"";
    })(),
    contactName:other?"":document.getElementById("tp-contact").value.trim(),
    contactPosition:other?"":document.getElementById("tp-position").value.trim(),
    contactInfo:other?"":document.getElementById("tp-contact-info").value.trim(),
    notes:document.getElementById("tp-notes").value.trim()
  };
  /* keep expected_date at the period's last day for overdue checks */
  p.expectedDate=trkPeriodEnd(p.expectedPeriod);
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
  document.getElementById("te-payment").value="Partially paid";
  trkSyncEntryPaymentVis();
  var fi=document.getElementById("te-files");if(fi)fi.value="";
  TRK_ATT=[];
  trkRenderAttList();
  m.classList.add("open");
}
/* the payment-level select only applies to Payment received entries */
function trkSyncEntryPaymentVis(){
  var wrap=document.getElementById("te-payment-wrap");
  if(wrap)wrap.style.display=document.getElementById("te-type").value==="Payment received"?"":"none";
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
  trkSyncEntryPaymentVis();
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
  /* Status re-derives in renderTracker below; payment is event-driven
     and only a Payment received entry moves it. */
  if(entry.type==="Payment received"){
    var proj=TRK_PROJECTS.find(function(x){return x._id===TRK_SEL;});
    var lvl=document.getElementById("te-payment").value;
    if(proj&&proj.payment!==lvl){
      proj.payment=lvl;
      try{
        await fetch(SB_URL+"/rest/v1/tracker_projects?id=eq."+proj._id,{method:"PATCH",headers:sbH(),body:JSON.stringify({payment:lvl})});
      }catch(err){console.error("Payment update failed:",err);}
    }
  }
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
