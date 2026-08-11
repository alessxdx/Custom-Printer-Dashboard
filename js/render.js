function parseDV(d){if(!d)return 0;const p=Date.parse(d);return isNaN(p)?0:p;}
function dDisplay(tx){return tx.displayDate||tx.date||"";}
function bStatus(s){
  if(s==="PO")return'<span class="badge b-po">&#10003; PO confirmed</span>';
  if(s==="Quotation")return'<span class="badge b-qt">&#9711; Quotation</span>';
  return'<span class="badge b-ls">&#10005; Lost quote</span>';
}
function bTerm(t){const m={DDP:"b-ddp",DAP:"b-dap",EXW:"b-exw"};return`<span class="badge ${m[t]||"b-exw"}">${t}</span>`;}
function bWarranty(w){if(!w)return"";const m={"5Y":"b-5y","3Y":"b-3y","2Y":"b-2y","1Y":"b-1y"};return`<span class="badge ${m[w]||"b-1y"}">${w} warranty</span>`;}

let currentTab="customers",expandedCards={},expandedRows={};

function setTab(btn){
  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");currentTab=btn.dataset.tab;
  document.getElementById("filter-bar").style.display=currentTab==="customers"?"flex":"none";
  renderContent();
}
function getFiltered(){
  const fc=document.getElementById("fc").value;
  const fm=document.getElementById("fm").value;
  const fs=document.getElementById("fs").value;
  return TX.filter(t=>(!fc||t.country===fc)&&(!fm||t.model===fm)&&(!fs||t.status===fs));
}
function refreshFilterOptions(){
  const fc=document.getElementById("fc"),fm=document.getElementById("fm");
  const fcV=fc.value,fmV=fm.value;
  fc.innerHTML='<option value="">All countries</option>';
  fm.innerHTML='<option value="">All models</option>';
  [...new Set(TX.map(t=>t.country))].sort().forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;if(c===fcV)o.selected=true;fc.appendChild(o);});
  [...new Set(TX.map(t=>t.model))].sort().forEach(m=>{const o=document.createElement("option");o.value=m;o.textContent=m;if(m===fmV)o.selected=true;fm.appendChild(o);});
  const cl=document.getElementById("customer-list"),ml=document.getElementById("model-list"),cntl=document.getElementById("country-list");
  if(cl)cl.innerHTML=[...new Set(TX.map(t=>t.customer))].sort().map(c=>`<option value="${c}">`).join("");
  if(ml){
    var stdModels=getModelList();
    var txModels=[...new Set(TX.map(t=>t.model))].filter(function(m){return !m.includes("+");});
    var allModels=[...new Set([...stdModels,...txModels])].sort();
    var curVal=ml.tagName==="SELECT"?ml.value:"";
    if(ml.tagName==="SELECT"){
      ml.innerHTML="<option value=''>-- Select model --</option>"+allModels.map(function(m){return "<option value='"+m+"'"+(m===curVal?" selected":"")+">"+m+"</option>";}).join("");
    } else {
      ml.innerHTML=allModels.map(function(m){return "<option value='"+m+"'>";}).join("");
    }
  }
  if(cntl)cntl.innerHTML=[...new Set(TX.map(t=>t.country))].sort().map(c=>`<option value="${c}">`).join("");
  var pgl=document.getElementById("project-group-list");if(pgl)pgl.innerHTML=[...new Set(TX.map(t=>t.projectGroup).filter(Boolean))].sort().map(p=>`<option value="${p}">`).join("");
}
/* A deal is identified by customer+country+project. To give By Customer a
   complete, non-double-counted overview that also spans By-Project data,
   every deal is resolved to ONE representation:
   - only a project exists  -> use the project (e.g. BOHOL-PANGLAO)
   - only a transaction      -> use the transaction
   - both, totals match      -> use the project (richer: line items, PDFs)
   - both, totals differ     -> keep the transaction (authoritative; the
                                project migration was incomplete, e.g.
                                SITA "Philippines T4 & T5")
   resolveDeals() returns {txs,projs} — the entries to display and count. */
function dealKey(customer,country,project){return (customer||"").trim().toLowerCase()+"||"+(country||"").trim().toLowerCase()+"||"+(project||"").trim().toLowerCase();}
function projTotalOf(p){if(p.totalOverride)return p.totalOverride;return (typeof LINE_ITEMS!=="undefined"?LINE_ITEMS:[]).filter(function(li){return li.projectId===p._id;}).reduce(function(s,li){return s+li.qty*li.unitPrice;},0);}
function txValueOf(t){var u=(typeof mdParseUnits==="function")?mdParseUnits(t.qty):0;return t.totalOverride?t.totalOverride:(u>0?t.price*u:t.price);}
function resolveDeals(){
  var txByKey={},projByKey={},keys={};
  TX.forEach(function(t){var k=dealKey(t.customer,t.country,t.project);(txByKey[k]=txByKey[k]||[]).push(t);keys[k]=1;});
  (typeof PROJECTS!=="undefined"?PROJECTS:[]).forEach(function(p){var k=dealKey(p.customer,p.country,p.project);(projByKey[k]=projByKey[k]||[]).push(p);keys[k]=1;});
  var txs=[],projs=[];
  Object.keys(keys).forEach(function(k){
    var t=txByKey[k]||[],p=projByKey[k]||[];
    if(p.length&&!t.length){projs=projs.concat(p);return;}
    if(!p.length){txs=txs.concat(t);return;}
    var pt=p.reduce(function(s,x){return s+projTotalOf(x);},0);
    var tt=t.reduce(function(s,x){return s+txValueOf(x);},0);
    if(Math.abs(pt-tt)<1)projs=projs.concat(p);else txs=txs.concat(t);
  });
  return {txs:txs,projs:projs};
}
function renderStats(){
  const R=resolveDeals(),all=R.txs.concat(R.projs);
  const pos=all.filter(x=>x.status==="PO").length;
  const qt=all.filter(x=>x.status==="Quotation").length;
  const ls=all.filter(x=>x.status==="Lose").length;
  const custSet=new Set();all.forEach(x=>custSet.add(x.customer+"__"+x.country));
  const cu=custSet.size;
  document.getElementById("stats").innerHTML=`
    <div class="stat"><div class="stat-label">Customers</div><div class="stat-value">${cu}</div><div class="stat-sub">across multiple countries</div></div>
    <div class="stat"><div class="stat-label">Confirmed POs</div><div class="stat-value">${pos}</div><div class="stat-sub">transactions</div></div>
    <div class="stat"><div class="stat-label">Open quotations</div><div class="stat-value">${qt}</div><div class="stat-sub">pending</div></div>
    <div class="stat"><div class="stat-label">Lost quotes</div><div class="stat-value">${ls}</div><div class="stat-sub">for reference</div></div>`;
}
function fxEqSpan(amount,currency){
  if(typeof fxUsdText!=="function")return "";
  const t=fxUsdText(amount,currency);
  return t?" <span class='fx-usd'>"+t+"</span>":"";
}
function projGroupLinkHtml(group){
  if(!group)return "";
  var esc=String(group).replace(/\\/g,"\\\\").replace(/'/g,"\\'");
  return "<span class='proj-group-tag clickable' onclick=\"event.stopPropagation();openProjectGroup('"+esc+"')\" title='View consolidated project group'>&#128279; "+group+" <span class='pgt-arrow'>&rarr;</span></span>";
}
function attShortName(n){
  var s=String(n||"PDF").replace(/\.pdf$/i,"");
  return s.length>18?s.slice(0,17)+"…":s;
}
const ATT_DOCTYPE_ORDER={Quotation:0,PO:1};
function attClipsHtml(list){
  if(!list||!list.length)return "";
  const sorted=[...list].sort(function(a,b){
    var da=a.doctype||(typeof guessDoctype==="function"?guessDoctype(a.name):"");
    var db=b.doctype||(typeof guessDoctype==="function"?guessDoctype(b.name):"");
    var ra=ATT_DOCTYPE_ORDER.hasOwnProperty(da)?ATT_DOCTYPE_ORDER[da]:2;
    var rb=ATT_DOCTYPE_ORDER.hasOwnProperty(db)?ATT_DOCTYPE_ORDER[db]:2;
    return ra-rb;
  });
  return sorted.map(function(a){
    var full=String(a.name||"PDF").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
    var dt=a.doctype||(typeof guessDoctype==="function"?guessDoctype(a.name):"");
    var useTag=dt&&dt!=="Other";
    var label=(useTag?dt:attShortName(a.name)).replace(/&/g,"&amp;").replace(/</g,"&lt;");
    var cls=useTag?" doc-"+dt.toLowerCase():"";
    return "<a class='pdf-clip"+cls+"' href='"+a.url+"' target='_blank' rel='noopener' onclick='event.stopPropagation()' title=\""+full+"\">&#128206; "+label+"</a>";
  }).join(" ");
}
/* Which project groups still have a combined "ATB + BTP" summary entry?
   Split rows are only hidden behind that entry's toggle; if the combined
   entry was deleted, the orphaned splits must show on their own. */
function combinedGroupsOf(txs){
  const combinedGroups={};
  txs.forEach(function(t){if(t.projectGroup&&t.model&&t.model.includes("+"))combinedGroups[t.projectGroup]=true;});
  return combinedGroups;
}
function txEntrySort(a,b){
  const aCombined=a.projectGroup&&a.model&&a.model.includes("+");
  const bCombined=b.projectGroup&&b.model&&b.model.includes("+");
  if(a.projectGroup&&b.projectGroup&&a.projectGroup===b.projectGroup){
    if(aCombined&&!bCombined)return -1;
    if(!aCombined&&bCombined)return 1;
  }
  return parseDV(b.date)-parseDV(a.date);
}
function buildTxEntriesHtml(txs){
  const combinedGroups=combinedGroupsOf(txs);
  return [...txs].sort(txEntrySort).map(function(tx){
    const inner=buildTxEntryHtml(tx);
    const isSplit=tx.projectGroup&&tx.project&&(tx.project.includes("— ATB")||tx.project.includes("— BTP"));
    const grpId=tx.projectGroup?tx.projectGroup.replace(/[^a-zA-Z0-9]/g,"-"):"";
    return (isSplit&&combinedGroups[tx.projectGroup])
      ?"<div class='grp-entry' data-group='"+grpId+"' style='display:none'>"+inner+"</div>"
      :inner;
  }).join("");
}
/* One history entry, fully expanded. Returned bare (no grp-entry wrapper) so
   both the flat list and the collapsed-row list can place it themselves. */
function buildTxEntryHtml(tx){
  {
    const margin=tx.bp&&tx.currency==="USD"?tx.price-tx.bp:null;
    const mPct=margin?((margin/tx.price)*100).toFixed(1):null;
    const isCombined=tx.projectGroup&&tx.model&&tx.model.includes("+");
    const grpId=tx.projectGroup?tx.projectGroup.replace(/[^a-zA-Z0-9]/g,"-"):"";
    const groupTag=(()=>{
      if(!tx.projectGroup)return "";
      if(isCombined)return "<div style='margin-bottom:5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap'><button class='expand-btn' onclick='toggleGroup(\""+grpId+"\",this,event)'>\u25bc Show individual model entries</button>"+projGroupLinkHtml(tx.projectGroup)+"</div>";
      return "<div style='margin-bottom:5px'>"+projGroupLinkHtml(tx.projectGroup)+"</div>";
    })();
    const pdfClip=attClipsHtml(tx.attachments);
    const fxNoteLine=(tx.currency!=="USD"&&typeof fxNote==="function"&&fxNote(tx.currency))?"<div class='fx-note'>"+fxNote(tx.currency)+"</div>":"";
    const inner="<div class='tx'><div>"+
      groupTag+
      "<div class='tx-date'>"+(dDisplay(tx)?dDisplay(tx)+" \xb7 ":"")+bStatus(tx.status)+pdfClip+"</div>"+
      "<div class='tx-model'>"+tx.model+" &nbsp;&middot;&nbsp; "+tx.project+" &nbsp;&middot;&nbsp; "+tx.qty+"</div>"+
      (tx.pn?"<div class='tx-pn'>"+tx.pn+"</div>":"")+
      "<div class='tx-badges'>"+tx.terms.map(bTerm).join("")+bWarranty(tx.warranty)+"</div>"+
      (tx.notes.length?"<div class='tx-notes'>"+tx.notes.map(function(n){return "<div class='tx-note'>"+n+"</div>";}).join("")+"</div>":"")+
    "</div>"+
    "<div style='text-align:right;display:flex;flex-direction:column;min-height:100%'>"+
      (tx.dualPrice?
        "<div style='text-align:right;line-height:1.8'>"+
          "<span style='font-size:10px;color:var(--text-muted)'>Cutter ARINC</span><br>"+
          "<span style='font-weight:600;font-size:13px;color:var(--text-strong)'>"+tx.price.toLocaleString()+" "+tx.currency+"</span>"+fxEqSpan(tx.price,tx.currency)+"<br>"+
          "<span style='font-size:10px;color:var(--text-muted)'>Non Cutter ARINC</span><br>"+
          "<span style='font-weight:600;font-size:13px;color:var(--text-strong)'>"+tx.dualPrice.toLocaleString()+" "+tx.currency+"</span>"+fxEqSpan(tx.dualPrice,tx.currency)+
        "</div>"
      :
        "<div class='tx-price'>"+tx.price.toLocaleString()+" "+tx.currency+fxEqSpan(tx.price,tx.currency)+"</div>"
      )+
      (margin!==null?"<div class='tx-margin'>Margin: $"+margin.toFixed(0)+" ("+mPct+"%)</div>":"")+
      (()=>{
        const qm=(tx.qty||"").match(/[0-9]+/);const q=qm?parseInt(qm[0]):null;const printerTot=(q&&q>0)?tx.price*q:null;
        if(tx.totalOverride){
          const pTot=tx.printerTotalOverride||(printerTot&&!tx.noPrinterTotal?printerTot:null);
          if(pTot)return "<div style='font-size:11px;color:var(--accent-text);margin-top:6px;padding-top:5px;border-top:1px solid var(--border-strong)'>Printer Total: <strong>"+pTot.toLocaleString()+" "+tx.currency+"</strong></div><div style='font-size:11px;color:var(--accent-text);margin-top:3px'>Project Total: <strong>"+tx.totalOverride.toLocaleString()+" "+tx.currency+"</strong>"+fxEqSpan(tx.totalOverride,tx.currency)+"</div>";
          return "<div style='font-size:11px;color:var(--accent-text);margin-top:6px;padding-top:5px;border-top:1px solid var(--border-strong)'>Project Total: <strong>"+tx.totalOverride.toLocaleString()+" "+tx.currency+"</strong>"+fxEqSpan(tx.totalOverride,tx.currency)+"</div>";
        }
        if(!printerTot)return "";
        if(tx.noPrinterTotal)return "<div style='font-size:11px;color:var(--accent-text);margin-top:6px;padding-top:5px;border-top:1px solid var(--border-strong)'>Project Total: <strong>"+printerTot.toLocaleString()+" "+tx.currency+"</strong>"+fxEqSpan(printerTot,tx.currency)+"</div>";
        return "<div style='font-size:11px;color:var(--accent-text);margin-top:6px;padding-top:5px;border-top:1px solid var(--border-strong)'>Printer Total: <strong>"+printerTot.toLocaleString()+" "+tx.currency+"</strong></div><div style='font-size:11px;color:var(--accent-text);margin-top:3px'>Project Total: <strong>"+printerTot.toLocaleString()+" "+tx.currency+"</strong>"+fxEqSpan(printerTot,tx.currency)+"</div>";
      })()+
      fxNoteLine+
      "<div style='display:flex;justify-content:flex-end;padding-bottom:14px;margin-top:auto;padding-top:8px'>"+
        "<button class='edit-btn' onclick='editTx("+TX.indexOf(tx)+",event)'>Edit</button>"+
      "</div>"+
    "</div></div>";
    return inner;
  }
}
/* ============================================================
   HISTORY LIST — one collapsed line per entry, grouped by date /
   model / project / status. A row expands into the exact block the
   history used to render inline (buildTxEntryHtml / buildProjectBlock),
   so every edge case — combined ATB+BTP toggles, dual pricing,
   overrides, PDF chips — looks identical once opened. Groups carry a
   per-currency subtotal, and entries sharing a PO number nest under a
   single parent row so a multi-line PO reads as the one order it is.
   ============================================================ */
var HX_OPEN={};        /* rowId -> true when its detail block is open */
var HX_YEAR_CLOSED={}; /* "groupScope|key" -> true when the group is collapsed */
var HX_YEAR_INIT={};   /* groupScope -> true once the open/closed defaults were applied */
var HX_MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var HX_AUTO_OPEN_ROWS=12; /* open groups top-down until this many rows show */
var HX_MODES=[{k:"date",label:"Date"},{k:"model",label:"Model"},{k:"project",label:"Project"},{k:"status",label:"Status"}];
var HX_MODE=(function(){try{return localStorage.getItem("cpd_hxgroup")||"date";}catch(e){return "date";}})();
var HX_STATUS_RANK={PO:0,Quotation:1,Lose:2};

function hxSafe(s){return String(s==null?"":s).replace(/[^a-zA-Z0-9]/g,"-");}
function hxAttr(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");}
function hxShortDate(ts){
  if(!ts)return "—";
  var d=new Date(ts);
  return d.getDate()+" "+HX_MONTHS[d.getMonth()];
}
function hxYearOf(ts){return ts?String(new Date(ts).getFullYear()):"Undated";}
/* Status as plain coloured text, not a filled pill — on a list where most
   rows share a status, six saturated badges are noise, not information. */
function hxMiniStatus(s){
  if(s==="PO")return "<span class='hx-st hx-st-po' title='PO confirmed'>PO</span>";
  if(s==="Quotation")return "<span class='hx-st hx-st-qt' title='Open quotation'>Quote</span>";
  if(s==="Mixed")return "<span class='hx-st hx-st-mix' title='Mixed statuses'>Mixed</span>";
  return "<span class='hx-st hx-st-ls' title='Lost quote'>Lost</span>";
}
/* PO numbers aren't a column — they live in a "PO 3165001907 - …" note.
   Require a digit so prose like "PO confirmed by email" isn't mistaken
   for an order number. */
function hxPoNumber(notes){
  for(var i=0;i<(notes||[]).length;i++){
    var m=/^PO[\s#:]*([A-Za-z0-9][A-Za-z0-9\/_-]*)/i.exec(String(notes[i]).trim());
    if(m&&/\d/.test(m[1]))return m[1].replace(/[.,;-]+$/,"");
  }
  return null;
}
/* Now that a PO is one project per site, the PO number lives in the project
   name ("Bali — PO 3165001907"). Inside a nest that already announces the PO,
   the suffix is noise. */
function hxStripPo(name,po){
  if(!po)return name;
  return String(name).replace(new RegExp("\\s*[—-]\\s*PO\\s*"+po+"\\s*$","i"),"")||name;
}
/* What's actually in a project, aggregated by item name so a PO with two
   lines of the same model reads as one figure. */
function hxProjSummary(pid){
  var order=[],byName={};
  (typeof LINE_ITEMS!=="undefined"?LINE_ITEMS:[])
    .filter(function(li){return li.projectId===pid&&li.type!=="discount";})
    /* Printers lead — they're what the deal is about; accessories follow. */
    .sort(function(a,b){
      var pa=a.type==="printer"?0:1,pb=b.type==="printer"?0:1;
      return pa-pb||a.sortOrder-b.sortOrder;
    })
    .forEach(function(li){
      if(!byName[li.name]){byName[li.name]=0;order.push(li.name);}
      byName[li.name]+=li.qty;
    });
  if(!order.length)return "—";
  var shown=order.slice(0,2).map(function(n){return n+" \xd7"+byName[n];});
  if(order.length>2)shown.push("+"+(order.length-2)+" more");
  return shown.join(" \xb7 ");
}
/* A project has no single model field — derive one from its printer lines. */
function hxProjModel(pid){
  var names=[];
  (typeof LINE_ITEMS!=="undefined"?LINE_ITEMS:[]).forEach(function(li){
    if(li.projectId===pid&&li.type==="printer"&&names.indexOf(li.name)===-1)names.push(li.name);
  });
  if(!names.length)return "Other";
  return names.length===1?names[0]:"Multiple models";
}
function hxUsd(v,cur){
  if(typeof fxToUSD!=="function")return 0;
  var u=fxToUSD(v,cur);
  return u===null||isNaN(u)?0:u;
}
/* Digits carry the weight; the currency code rides along dimmed so a column
   of amounts reads as numbers rather than as numbers-plus-noise. */
function hxAmount(v,cur){
  if(!v)return "<span class='hx-cur'>—</span>";
  return v.toLocaleString(undefined,{maximumFractionDigits:0})+"<span class='hx-cur'>"+cur+"</span>";
}
function hxTotals(map){
  var curs=Object.keys(map).sort();
  if(!curs.length)return "";
  return curs.map(function(c){return hxAmount(map[c],c);}).join(" \xb7 ");
}

/* Flatten transactions + project-only deals into one sortable row model. */
function hxItems(txs,projs){
  var combined=combinedGroupsOf(txs);
  var items=txs.map(function(tx){
    var isCombined=!!(tx.projectGroup&&tx.model&&tx.model.indexOf("+")!==-1);
    var isSplit=!!(tx.projectGroup&&tx.project&&(tx.project.indexOf("— ATB")!==-1||tx.project.indexOf("— BTP")!==-1));
    return {
      id:"t"+TX.indexOf(tx),ts:parseDV(tx.date),status:tx.status,
      title:tx.model,sub:[tx.project,tx.qty].filter(Boolean).join(" \xb7 "),
      value:txValueOf(tx),currency:tx.currency,
      atts:tx.attachments,group:tx.projectGroup,
      model:tx.model,project:tx.project,po:hxPoNumber(tx.notes),
      combined:isCombined,hidden:isSplit&&!!combined[tx.projectGroup],
      body:buildTxEntryHtml(tx)
    };
  });
  (projs||[]).forEach(function(p){
    items.push({
      id:"p"+hxSafe(p._id),ts:parseDV(p.date),status:p.status,
      title:p.project,sub:hxProjSummary(p._id),lineCount:(typeof LINE_ITEMS!=="undefined"?LINE_ITEMS:[]).filter(function(l){return l.projectId===p._id;}).length,
      value:projTotalOf(p),currency:p.currency,
      atts:p.attachments,group:p.projectGroup,
      model:hxProjModel(p._id),project:p.project,po:hxPoNumber(p.notes),
      combined:false,hidden:false,
      body:buildProjectBlock(p)
    });
  });
  /* Newest first, but a combined entry always sits directly above the split
     rows it hides, so revealing them keeps them next to their parent. */
  items.sort(function(a,b){
    if(a.group&&b.group&&a.group===b.group){
      if(a.combined&&!b.combined)return -1;
      if(!a.combined&&b.combined)return 1;
    }
    return b.ts-a.ts;
  });
  return items;
}

function hxRowHtml(it,sc,parentPo){
  var rid=sc+"-"+it.id,open=!!HX_OPEN[rid];
  var title=parentPo?hxStripPo(it.title,parentPo):it.title;
  var icons="";
  if(it.atts&&it.atts.length)icons+="<span class='hx-ico' title='"+it.atts.length+" attachment"+(it.atts.length!==1?"s":"")+"'>&#128206;</span>";
  if(it.group)icons+="<span class='hx-ico' title=\"Project group: "+hxAttr(it.group)+"\">&#128279;</span>";
  var row="<div class='hx-row"+(open?" open":"")+"' onclick=\"hxToggleRow('"+rid+"')\">"+
      "<span class='hx-date'>"+hxShortDate(it.ts)+"</span>"+
      hxMiniStatus(it.status)+
      "<span class='hx-title'>"+title+"</span>"+
      "<span class='hx-sub'>"+it.sub+"</span>"+
      "<span class='hx-icons'>"+icons+"</span>"+
      "<span class='hx-val'>"+hxAmount(it.value,it.currency)+"</span>"+
      "<span class='hx-chev"+(open?" open":"")+"' id='hx-c-"+rid+"'>▾</span>"+
    "</div>"+
    "<div class='hx-body' id='hx-b-"+rid+"'"+(open?"":" style='display:none'")+">"+it.body+"</div>";
  return it.hidden
    ?"<div class='hx-item grp-entry' data-group='"+hxSafe(it.group)+"' style='display:none'>"+row+"</div>"
    :"<div class='hx-item'>"+row+"</div>";
}

/* Which bucket an entry falls into under the active grouping mode. */
function hxGroupLabel(it,mode){
  if(mode==="model")return it.model||"Other";
  if(mode==="project")return it.group||it.project||"Other";
  if(mode==="status")return it.status==="PO"?"Confirmed POs":(it.status==="Quotation"?"Open quotations":"Lost quotes");
  return hxYearOf(it.ts);
}
/* Collapse entries that share a PO number into one parent row. Only worth it
   at 2+ lines; hidden split rows stay in the flat flow (they're display:none
   until their combined parent reveals them). */
function hxNest(items){
  var counts={};
  items.forEach(function(it){if(it.po&&!it.hidden)counts[it.po]=(counts[it.po]||0)+1;});
  var out=[],seen={};
  items.forEach(function(it){
    if(!it.po||it.hidden||counts[it.po]<2){out.push(it);return;}
    if(seen[it.po])return;
    seen[it.po]=true;
    out.push({nest:true,po:it.po,children:items.filter(function(o){return o.po===it.po&&!o.hidden;})});
  });
  return out;
}
function hxNestHtml(n,sc){
  var nid=sc+"-po-"+hxSafe(n.po),open=!!HX_OPEN[nid];
  var totals={},atts=0,ts=0,status=null,mixed=false,sites=[],lines=0;
  n.children.forEach(function(c){
    if(c.currency&&c.value)totals[c.currency]=(totals[c.currency]||0)+c.value;
    atts+=(c.atts||[]).length;
    if(c.ts>ts)ts=c.ts;
    if(status===null)status=c.status;else if(status!==c.status)mixed=true;
    lines+=c.lineCount||1;
    var site=hxStripPo(c.project||"",n.po);
    if(site&&sites.indexOf(site)===-1)sites.push(site);
  });
  var icons=atts?"<span class='hx-ico' title='"+atts+" attachment"+(atts!==1?"s":"")+"'>&#128206;</span>":"";
  var sub=lines+" line"+(lines!==1?"s":"")+(sites.length?" \xb7 "+sites.join(", "):"");
  return "<div class='hx-item hx-nest"+(open?" open":"")+"'>"+
    "<div class='hx-row hx-nest-head"+(open?" open":"")+"' onclick=\"hxToggleRow('"+nid+"')\">"+
      "<span class='hx-date'>"+hxShortDate(ts)+"</span>"+
      hxMiniStatus(mixed?"Mixed":status)+
      "<span class='hx-title'>PO "+n.po+"</span>"+
      "<span class='hx-sub'>"+sub+"</span>"+
      "<span class='hx-icons'>"+icons+"</span>"+
      "<span class='hx-val'>"+hxTotals(totals)+"</span>"+
      "<span class='hx-chev"+(open?" open":"")+"' id='hx-c-"+nid+"'>▾</span>"+
    "</div>"+
    "<div class='hx-nest-body' id='hx-b-"+nid+"'"+(open?"":" style='display:none'")+">"+
      n.children.map(function(c){return hxRowHtml(c,sc,n.po);}).join("")+
    "</div>"+
  "</div>";
}
/* Count orders, not records. A PO split across two sites is one order, so
   "3 POs" is the honest headline where "4 entries" counted rows. */
function hxCountLabel(rows,entryCount){
  var n=rows.length,st=null,mixed=false;
  rows.forEach(function(r){
    (r.nest?r.children:[r]).forEach(function(c){
      if(st===null)st=c.status;else if(st!==c.status)mixed=true;
    });
  });
  var noun=mixed?(n===1?"order":"orders"):
    (st==="PO"?(n===1?"PO":"POs"):
     st==="Quotation"?(n===1?"quotation":"quotations"):
     (n===1?"lost quote":"lost quotes"));
  return n+" "+noun+(entryCount>n?" \xb7 "+entryCount+" records":"");
}
/* Same unit as hxCountLabel, but cheap — no entry bodies built. */
function hxOrderCount(txs,projs){
  var combined=combinedGroupsOf(txs||[]),seen={},n=0;
  function add(po,hidden){
    if(hidden)return;
    if(po){if(seen[po])return;seen[po]=true;}
    n++;
  }
  (txs||[]).forEach(function(t){
    var isSplit=!!(t.projectGroup&&t.project&&(t.project.indexOf("— ATB")!==-1||t.project.indexOf("— BTP")!==-1));
    add(hxPoNumber(t.notes),isSplit&&!!combined[t.projectGroup]);
  });
  (projs||[]).forEach(function(p){add(hxPoNumber(p.notes),false);});
  return n;
}
function hxToolbar(){
  return "<div class='hx-bar'><span class='hx-bar-lbl'>Group by</span>"+
    HX_MODES.map(function(m){
      return "<button class='hx-chip"+(HX_MODE===m.k?" active":"")+"' onclick=\"hxSetMode('"+m.k+"')\">"+m.label+"</button>";
    }).join("")+
  "</div>";
}
function hxSetMode(m){
  if(HX_MODE===m)return;
  HX_MODE=m;
  try{localStorage.setItem("cpd_hxgroup",m);}catch(e){}
  renderContent();
}

function buildHistoryHtml(txs,projs,scope,opts){
  var showBar=!opts||opts.toolbar!==false;
  var items=hxItems(txs,projs);
  if(!items.length)return (showBar?hxToolbar():"")+"<div class='hx-none'>No entries.</div>";
  /* Row state is keyed without the mode so expanded rows survive a regroup;
     group state is keyed with it, since the buckets themselves change. */
  var sc=hxSafe(scope||"hx"),gsc=sc+"--"+HX_MODE;
  var keys=[],byKey={};
  items.forEach(function(it){
    var label=hxGroupLabel(it,HX_MODE);
    if(!byKey[label]){byKey[label]={label:label,items:[],count:0,pos:0,totals:{},usd:0,ts:0};keys.push(label);}
    var g=byKey[label];
    g.items.push(it);
    if(it.hidden)return; /* split rows would double-count their combined parent */
    g.count++;
    if(it.status==="PO")g.pos++;
    if(it.ts>g.ts)g.ts=it.ts;
    if(it.currency&&it.value){
      g.totals[it.currency]=(g.totals[it.currency]||0)+it.value;
      g.usd+=hxUsd(it.value,it.currency);
    }
  });
  /* Nest before measuring: an order is the unit a group counts, and the
     auto-open budget is spent in rows, not records. */
  keys.forEach(function(k){var g=byKey[k];g.rows=hxNest(g.items);g.orders=g.rows.length;});
  /* Date keeps the newest-first order the items already have; status uses a
     fixed pipeline order; model/project lead with the biggest money. */
  if(HX_MODE==="status"){
    keys.sort(function(a,b){
      function rank(l){return l==="Confirmed POs"?0:(l==="Open quotations"?1:2);}
      return rank(a)-rank(b);
    });
  }else if(HX_MODE==="model"||HX_MODE==="project"){
    keys.sort(function(a,b){
      var d=byKey[b].usd-byKey[a].usd;
      if(d)return d;
      d=byKey[b].count-byKey[a].count;
      return d||a.localeCompare(b);
    });
  }
  if(!HX_YEAR_INIT[gsc]){
    HX_YEAR_INIT[gsc]=true;
    var shown=0,closing=false;
    keys.forEach(function(k){
      var n=byKey[k].orders;
      if(closing||(shown>0&&shown+n>HX_AUTO_OPEN_ROWS)){closing=true;HX_YEAR_CLOSED[gsc+"|"+hxSafe(k)]=true;}
      else shown+=n;
    });
  }
  var groupsHtml=keys.map(function(k,i){
    var g=byKey[k],gk=hxSafe(k)+"-"+i;
    var closed=!!HX_YEAR_CLOSED[gsc+"|"+hxSafe(k)],gid="hx-g-"+gsc+"-"+gk;
    var meta=hxCountLabel(g.rows,g.count);
    return "<div class='hx-group'>"+
      "<div class='hx-ghead' onclick=\"hxToggleYear('"+gsc+"','"+hxSafe(k)+"','"+gk+"')\">"+
        "<span class='hx-gchev"+(closed?"":" open")+"' id='"+gid+"-chev'>▸</span>"+
        "<span class='hx-gyear'>"+g.label+"</span>"+
        "<span class='hx-gmeta'>"+meta+"</span>"+
        "<span class='hx-gtot'>"+hxTotals(g.totals)+"</span>"+
      "</div>"+
      "<div class='hx-gbody' id='"+gid+"'"+(closed?" style='display:none'":"")+">"+
        g.rows.map(function(row){return row.nest?hxNestHtml(row,sc):hxRowHtml(row,sc);}).join("")+
      "</div>"+
    "</div>";
  }).join("");
  return (showBar?hxToolbar():"")+groupsHtml;
}

function hxToggleRow(rid){
  HX_OPEN[rid]=!HX_OPEN[rid];
  var b=document.getElementById("hx-b-"+rid);
  if(b){
    b.style.display=HX_OPEN[rid]?"":"none";
    if(b.parentNode&&b.parentNode.classList.contains("hx-nest"))b.parentNode.classList.toggle("open",HX_OPEN[rid]);
  }
  var c=document.getElementById("hx-c-"+rid);
  if(c){
    c.classList.toggle("open",HX_OPEN[rid]);
    if(c.parentNode)c.parentNode.classList.toggle("open",HX_OPEN[rid]);
  }
}
function hxToggleYear(gsc,key,gk){
  var k=gsc+"|"+key;
  HX_YEAR_CLOSED[k]=!HX_YEAR_CLOSED[k];
  var b=document.getElementById("hx-g-"+gsc+"-"+gk);
  if(b)b.style.display=HX_YEAR_CLOSED[k]?"none":"";
  var c=document.getElementById("hx-g-"+gsc+"-"+gk+"-chev");
  if(c)c.classList.toggle("open",!HX_YEAR_CLOSED[k]);
}

function buildCustomerCard(name,txs){
  const country=txs[0].country,flagIcon=FLAGS[country]||"\u{1F310}";
  const cardKey=name+"__"+country,isOpen=expandedCards[cardKey];
  const pos=txs.filter(t=>t.status==="PO").length,qt=txs.filter(t=>t.status!=="PO").length;
  const rows=buildTxEntriesHtml(txs);
  const sid=cardKey.replace(/[^a-zA-Z0-9]/g,"-");
  const escapedKey=cardKey.replace(/'/g,"\\'");
  return`<div class="card">
    <div class="card-header" onclick="toggleCard('${escapedKey}','${sid}')">
      <div class="flag-icon">${flagIcon}</div>
      <div style="flex:1"><div class="cname">${name}</div>
      <div class="cmeta">${country} \xb7 ${pos} PO${pos!==1?"s":""} \xb7 ${qt} quote${qt!==1?"s":""}</div></div>
      <div class="chevron ${isOpen?"open":""}" id="chev-${sid}">\u25be</div>
    </div>
    <div class="card-body ${isOpen?"open":""}" id="body-${sid}">${rows}</div>
  </div>`;
}
function renderCustomers(){
  const data=getFiltered(),sortMode=document.getElementById("fsort").value,groupMode="country";
  const byC={};
  data.forEach(t=>{const key=t.customer+"__"+t.country;if(!byC[key])byC[key]=[];byC[key].push(t);});
  if(!Object.keys(byC).length){document.getElementById("content").innerHTML='<div class="empty">No transactions match your filters.</div>';return;}
  let entries=Object.entries(byC).map(([key,txs])=>[txs[0].customer,txs,key]);
  if(sortMode==="name")entries.sort((a,b)=>a[0].localeCompare(b[0]));
  else if(sortMode==="name-desc")entries.sort((a,b)=>b[0].localeCompare(a[0]));
  else if(sortMode==="po-desc")entries.sort((a,b)=>b[1].filter(t=>t.status==="PO").length-a[1].filter(t=>t.status==="PO").length);
  else if(sortMode==="recent")entries.sort((a,b)=>Math.max(...b[1].map(t=>parseDV(t.date)))-Math.max(...a[1].map(t=>parseDV(t.date))));
  let html="";
  if(groupMode==="country"){
    const byCountry={};
    entries.forEach(([name,txs,key])=>{const c=txs[0].country||"Unknown";if(!byCountry[c])byCountry[c]=[];byCountry[c].push([name,txs,key]);});
    Object.entries(byCountry).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([country,list])=>{
      const f=flagImg(country,18);
      html+=`<div class="country-group-label">${f} ${country} <span class="country-count">${list.length} customer${list.length!==1?"s":""}</span></div>`;
      list.forEach(([name,txs])=>{html+=buildCustomerCard(name,txs);});
    });
  } else {
    entries.forEach(([name,txs])=>{html+=buildCustomerCard(name,txs);});
  }
  document.getElementById("content").innerHTML=html;
}
function toggleGroup(grp,btn,e){
  e.stopPropagation();
  const entries=document.querySelectorAll(".grp-entry[data-group=\""+grp+"\"]");
  const isHidden=entries.length>0&&entries[0].style.display==="none";
  entries.forEach(function(el){el.style.display=isHidden?"block":"none";});
  btn.innerHTML=isHidden?"&#9650; Hide individual model entries":"&#9660; Show individual model entries";
}
function toggleCard(key,sid){
  expandedCards[key]=!expandedCards[key];
  document.getElementById("body-"+sid).classList.toggle("open",expandedCards[key]);
  document.getElementById("chev-"+sid).classList.toggle("open",expandedCards[key]);
}
function renderModel(){
  const MODEL_GROUPS={
    "TK180 Metal Cutter":["TK180 Metal Cutter","TK180 Metal Cutter ARINC"],
    "TK180 Metal Non Cutter":["TK180 Metal Non Cutter","TK180 Metal Non Cutter ARINC"],
  };
  const allModels=[...new Set(TX.map(t=>t.displayModel||t.model))];
  const models=allModels.filter(m=>!Object.values(MODEL_GROUPS).flat().includes(m)||Object.keys(MODEL_GROUPS).includes(m)).sort();
  const sel=document.getElementById("model-sel"),current=sel?sel.value:models[0];
  const groupModels=MODEL_GROUPS[current]||[current];
  const txs=TX.filter(t=>groupModels.includes(t.displayModel||t.model)&&t.model!=="TK180 Metal Cutter ARINC (ATB) + TK180 Metal Non Cutter ARINC (BTP)").sort((a,b)=>parseDV(b.date)-parseDV(a.date));
  const opts=models.map(m=>`<option value="${m}"${m===current?" selected":""}>${m}</option>`).join("");
  let rows="";
  txs.forEach((tx,i)=>{
    const margin=tx.bp&&tx.currency==="USD"?(tx.price-tx.bp).toFixed(0):null;
    const mPct=margin?((margin/tx.price)*100).toFixed(1):null;
    const f=flagImg(tx.country,18);
    rows+=`<tr class="clickable" onclick="toggleRow(${i})">
      <td style="color:var(--text-faint);white-space:nowrap;font-size:12px">${dDisplay(tx)||"\u2014"}</td>
      <td style="font-weight:600;font-family:'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji','Montserrat',sans-serif">${f} ${tx.customer}</td>
      <td style="color:var(--text-muted);font-size:12px">${tx.project||"\u2014"}</td>
      <td style="color:var(--text-muted)">${tx.country}</td>
      <td>${bStatus(tx.status)}</td>
      <td>${tx.terms.map(bTerm).join("")}${bWarranty(tx.warranty)}</td>
      <td style="text-align:right;font-weight:600">${tx.price.toLocaleString()} ${tx.currency}</td>
      <td style="text-align:right;color:#aaa;font-size:12px">${margin?`$${margin} (${mPct}%)`:"—"}</td>
    </tr><tr class="exp-detail ${expandedRows[i]?"open":""}" id="erow-${i}">
      <td colspan="8"><strong>Project:</strong> ${tx.project} | <strong>Qty:</strong> ${tx.qty} | <strong>PN:</strong> ${tx.pn||"\u2014"}${tx.notes.length?" | "+tx.notes.join(" \xb7 "):""}</td>
    </tr>`;
  });
  document.getElementById("content").innerHTML=`<div class="cmp-wrap"><div class="cmp-head">
    <span class="cmp-lbl">Compare model</span>
    <select id="model-sel" onchange="renderModel()">${opts}</select>
    <span class="cmp-hint">${txs.length} records \u2014 click row for detail</span>
  </div><div style="overflow-x:auto"><table>
    <thead><tr><th>Date</th><th>Customer</th><th>Project</th><th>Country</th><th>Status</th><th>Terms</th><th style="text-align:right">Price</th><th style="text-align:right">Margin</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="7" class="empty">No data.</td></tr>'}</tbody>
  </table></div></div>`;
}
function toggleRow(i){expandedRows[i]=!expandedRows[i];const el=document.getElementById("erow-"+i);if(el)el.classList.toggle("open",expandedRows[i]);}
function renderBuying(){
  var sortBuy=document.getElementById("buy-sort")?document.getElementById("buy-sort").value:"model";
  var searchVal=document.getElementById("buy-search")?document.getElementById("buy-search").value:"";
  var searchLow=searchVal.toLowerCase();
  var expandedGroups=window._buyGroups||{};
  var sorted=BUYING.map(function(b,i){return {model:b.model,pn:b.pn,price:b.price,currency:b.currency,specialPrice:b.specialPrice,specialCustomer:b.specialCustomer,group:b.group,_i:i};});
  if(searchLow) sorted=sorted.filter(function(b){return b.model.toLowerCase().indexOf(searchLow)!==-1||(b.pn||"").toLowerCase().indexOf(searchLow)!==-1;});
  if(sortBuy==="price-asc")sorted.sort(function(a,b){return a.price-b.price;});
  else if(sortBuy==="price-desc")sorted.sort(function(a,b){return b.price-a.price;});
  else sorted.sort(function(a,b){return a.model.localeCompare(b.model);});

  var groups={};
  var noGroup=[];
  sorted.forEach(function(b){
    if(b.group){if(!groups[b.group])groups[b.group]=[];groups[b.group].push(b);}
    else noGroup.push(b);
  });

  function makeRow(b){
    var grpTag=b.group?"<div style='font-size:10px;color:var(--accent-text);margin-top:2px'>"+b.group+"</div>":"";
    var spCell=b.specialPrice?
      "<td style='text-align:right'><div style='font-weight:600;color:var(--badge-special-fg)'>$"+b.specialPrice.toFixed(2)+" "+b.currency+"</div><div style='font-size:10px;color:var(--text-faint);margin-top:1px'>"+(b.specialCustomer||"Special")+"</div></td>":
      "<td style='text-align:right;color:var(--text-faint);font-size:12px'>—</td>";
    return "<tr><td style='font-weight:500'>"+b.model+grpTag+"</td><td style='font-size:11px;color:var(--text-muted);font-family:monospace'>"+(b.pn||"—")+"</td><td style='text-align:right;font-weight:600;color:var(--accent-text)'>$"+b.price.toFixed(2)+" "+b.currency+"</td>"+spCell+"<td style='text-align:right;white-space:nowrap'><button class='edit-btn' onclick='editBuying("+b._i+")' style='margin-right:8px'>Edit</button><button class='delete-btn' onclick='sbDeleteBuying("+b._i+")'>Remove</button></td></tr>";
  }

  var rows="";
  noGroup.forEach(function(b){rows+=makeRow(b);});
  Object.keys(groups).sort().forEach(function(grp){
    var isExp=!!expandedGroups[grp];
    var grpId=grp.replace(/[^a-zA-Z0-9]/g,"-");
    rows+="<tr style='background:var(--accent-soft);cursor:pointer' onclick='toggleBuyGroup(event,this.dataset.grp)' data-grp='"+grp.replace(/'/g,"&apos;")+"'>"+
      "<td colspan='5' style='font-size:11px;font-weight:600;color:var(--accent-text);padding:8px 12px'>"+
        "<span id='buy-grp-icon-"+grpId+"'>"+(isExp?"▲":"▼")+"</span> "+grp+" ("+groups[grp].length+" items)"+
      "</td></tr>";
    if(isExp){groups[grp].forEach(function(b){rows+=makeRow(b);});}
  });

  var bgl=document.getElementById("b-group-list");
  if(bgl){var grps=[...new Set(BUYING.map(function(b){return b.group;}).filter(Boolean))].sort();bgl.innerHTML=grps.map(function(g){return "<option value='"+g+"'>";}).join("");}
  var tbody=document.getElementById("buy-tbody");
  var countEl=document.getElementById("buy-count");
  if(tbody){tbody.innerHTML=rows||"<tr><td colspan='5' style='text-align:center;padding:20px;color:#aaa'>No results found</td></tr>";if(countEl)countEl.textContent=sorted.length+" / "+BUYING.length+" items";return;}

  document.getElementById("content").innerHTML=
    "<div class='buying-card'>"+
    "<div style='padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--accent-soft)'>"+
      "<input id='buy-search' type='text' placeholder='Search model or part number...' oninput='renderBuying()' value='"+searchVal.replace(/'/g,"&#39;")+"' style='font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid var(--border-strong);background:var(--bg-input);color:var(--text);font-family:Montserrat,sans-serif;width:240px'>"+
      "<span style='font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--accent-text);margin-left:4px'>Sort</span>"+
      "<select id='buy-sort' onchange='renderBuying()' style='font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid var(--border-strong);background:var(--bg-input);color:var(--text);font-family:Montserrat,sans-serif'>"+
        "<option value='model'"+(sortBuy==="model"?" selected":"")+">Model A–Z</option>"+
        "<option value='price-asc'"+(sortBuy==="price-asc"?" selected":"")+">Price: Low to high</option>"+
        "<option value='price-desc'"+(sortBuy==="price-desc"?" selected":"")+">Price: High to low</option>"+
      "</select>"+
      "<span id='buy-count' style='font-size:11px;color:var(--text-muted)'>"+sorted.length+" / "+BUYING.length+" items</span>"+
    "</div>"+
    "<div style='overflow-x:auto'><table><thead><tr><th>Model</th><th>Part number</th><th style='text-align:right'>Buying price</th><th style='text-align:right'>Special price</th><th></th></tr></thead>"+
    "<tbody id='buy-tbody'>"+(rows||"<tr><td colspan='5' style='text-align:center;padding:20px;color:#aaa'>No results found</td></tr>")+"</tbody></table></div>"+
    "</div>";
  var inp=document.getElementById("buy-search");
  if(inp){inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);}
}

function toggleBuyGroup(evtOrEl,grpArg){
  var grp=grpArg!==undefined?grpArg:(evtOrEl.dataset?evtOrEl.dataset.grp:evtOrEl);
  if(evtOrEl&&evtOrEl.preventDefault){evtOrEl.preventDefault();evtOrEl.stopPropagation();}
  // Remember scroll position
  var scrollY=window.scrollY||window.pageYOffset;
  if(!window._buyGroups)window._buyGroups={};
  window._buyGroups[grp]=!window._buyGroups[grp];
  renderBuying();
  // Restore scroll position after render
  window.scrollTo(0,scrollY);
}

function renderOthers(){
  const rows=OTHERS.map((o,i)=>`<div class="others-row"><div style="flex:1">${o.date?`<div class="others-date">${o.date}</div>`:""}<div class="others-desc">${o.desc}</div>${o.sub?`<div class="others-sub">${o.sub}</div>`:""}</div><div style="display:flex;align-items:start;gap:12px;flex-shrink:0"><div class="others-val">${o.value}</div><button class="edit-btn" onclick="editOther(${i})">Edit</button><button class="delete-btn" onclick="deleteOther(${i})">Remove</button></div></div>`).join("");
  document.getElementById("content").innerHTML=`<div class="others-card">${rows}</div>`;
}
let SPARES=[
  {name:"TK180 TPH",pn:"43000000045700",price:118,currency:"USD",customer:"Philippines Airlines",terms:"DDP",note:"Quotation 17 Apr 2026"},
  {name:"TK180 TPH",pn:"43000000045700",price:108.80,currency:"USD",customer:"Arinc",terms:"EXW",note:"Standard price"},
  {name:"TK180 TPH",pn:"43000000045700",price:1788000,currency:"IDR",customer:"SITA Indonesia",terms:"DDP",note:"PO 3 Feb 2026 — 50 units"},
  {name:"Roll Holder (TK180)",pn:"974HL020000004",price:108,currency:"SGD",customer:"Singapore Airlines",terms:"",note:"Changi Airport TK180 project"},
  {name:"Roll Holder",pn:"974HL010000009",price:128,currency:"SGD",customer:"Singapore Cruise Center",terms:"",note:"Harborfront Cruise"},
  {name:"Roll Holder",pn:"974HL010000009",price:98,currency:"USD",customer:"Aboitiz",terms:"",note:"Cebu, Bohol & Laguindingan"},
  {name:"Roll Holder (Daifuku)",pn:"",price:78,currency:"USD",customer:"Daifuku",terms:"",note:"Gold Coast quotation"},
  {name:"Vertical Tray TK302 Metal Case",pn:"974BB060000003",price:78,currency:"SGD",customer:"Singapore Airlines",terms:"",note:"Changi Airport TK302 project"},
  {name:"Ticket Tray Metal",pn:"976HL010000007",price:98,currency:"USD",customer:"Aboitiz",terms:"",note:"Bohol & Laguindingan"},
  {name:"1.8M USB Cable",pn:"2650000000003566",price:10.80,currency:"USD",customer:"Aboitiz",terms:"",note:"Bohol & Laguindingan"},
  {name:"USA Plug Power Cable",pn:"2610000000031",price:17.80,currency:"USD",customer:"Aboitiz",terms:"",note:"Bohol & Laguindingan"},
  {name:"Paper Roll",pn:"",price:580000,currency:"IDR",customer:"SITA Indonesia",terms:"",note:"DPS Bali & SUB Surabaya"},
  {name:"On-site installation",pn:"",price:42,currency:"SGD",customer:"Singapore Airlines",terms:"",note:"Per unit — Changi Airport"},
  {name:"Annual maintenance + consumables",pn:"",price:240,currency:"SGD",customer:"Singapore Airlines",terms:"",note:"Per printer per year — Changi Airport"},
];

SPARES_SEED=SPARES.map(function(s){return Object.assign({},s);});
MODELS_SEED=["TK180 Plastic","TK180 Plastic AEA","TK180 Metal Cutter","TK180 Metal Cutter AEA","TK180 Metal Cutter NON AEA","TK180 Metal Cutter ARINC","TK180 Metal Non Cutter","TK180 Metal Non Cutter ARINC","TK180 TPH","TK302 Metal Triple Feeder","KPM180 Cutter NON AEA","KPM180 with AEA","KPM180H-LL","KPM180 NON AEA","KPM180 TPH","TK202 Plastic","TK202 with AEA","TG2460HIII","TG2480HIII","VKP80II","VKP80II-RX","VKP80III","VKP80III Rear Connector","K80","KX80S"];

function renderSpares(){
  var searchVal=document.getElementById("sp-search")?document.getElementById("sp-search").value:"";
  var sortVal=document.getElementById("sp-sort")?document.getElementById("sp-sort").value:"name";
  var searchLow=searchVal.toLowerCase();
  var filtered=SPARES.map(function(s,i){return Object.assign({},s,{_i:i});});
  if(searchLow)filtered=filtered.filter(function(s){
    return s.name.toLowerCase().indexOf(searchLow)!==-1||
      (s.pn||"").toLowerCase().indexOf(searchLow)!==-1||
      (s.customer||"").toLowerCase().indexOf(searchLow)!==-1||
      (s.note||"").toLowerCase().indexOf(searchLow)!==-1;
  });
  if(sortVal==="name")filtered.sort(function(a,b){return a.name.localeCompare(b.name);});
  else if(sortVal==="price-asc")filtered.sort(function(a,b){return a.price-b.price;});
  else if(sortVal==="price-desc")filtered.sort(function(a,b){return b.price-a.price;});
  else if(sortVal==="customer")filtered.sort(function(a,b){return (a.customer||"").localeCompare(b.customer||"");});

  var rows=filtered.map(function(s){
    var pn=s.pn||"—";
    var terms=s.terms||"—";
    return "<tr>"+
      "<td style='font-weight:500'>"+s.name+"</td>"+
      "<td style='font-size:11px;color:var(--text-muted);font-family:monospace'>"+pn+"</td>"+
      "<td style='color:var(--text-muted);font-size:12px'>"+s.customer+"</td>"+
      "<td style='text-align:right;font-weight:600;color:var(--accent-text)'>"+s.price.toLocaleString()+" "+s.currency+"</td>"+
      "<td style='font-size:12px;color:var(--text-muted)'>"+(s.terms||"—")+"</td>"+
      "<td style='font-size:11px;color:var(--text-faint);font-style:italic'>"+s.note+"</td>"+
      "<td style='text-align:right;white-space:nowrap'>"+
        "<button class='edit-btn' onclick='editSpare("+s._i+")' style='margin-right:8px'>Edit</button>"+
        "<button class='delete-btn' onclick='deleteSpare("+s._i+")'>Remove</button>"+
      "</td>"+
    "</tr>";
  }).join("");

  var tbody=document.getElementById("sp-tbody");
  var countEl=document.getElementById("sp-count");
  if(tbody){
    tbody.innerHTML=rows||"<tr><td colspan='7' style='text-align:center;padding:20px;color:#aaa'>No results found</td></tr>";
    if(countEl)countEl.textContent=filtered.length+" / "+SPARES.length+" items";
    return;
  }

  document.getElementById("content").innerHTML=
    "<div class='buying-card'>"+
    "<div style='padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--accent-soft)'>"+
      "<input id='sp-search' type='text' placeholder='Search name, part number, customer...' oninput='renderSpares()' value='"+searchVal.replace(/'/g,"&#39;")+"' style='font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid var(--border-strong);background:var(--bg-input);color:var(--text);font-family:Montserrat,sans-serif;width:280px'>"+
      "<span style='font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--accent-text);margin-left:4px'>Sort</span>"+
      "<select id='sp-sort' onchange='renderSpares()' style='font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid var(--border-strong);background:var(--bg-input);color:var(--text);font-family:Montserrat,sans-serif'>"+
        "<option value='name'"+(sortVal==="name"?" selected":"")+">Name A–Z</option>"+
        "<option value='customer'"+(sortVal==="customer"?" selected":"")+">Customer A–Z</option>"+
        "<option value='price-asc'"+(sortVal==="price-asc"?" selected":"")+">Price: Low to high</option>"+
        "<option value='price-desc'"+(sortVal==="price-desc"?" selected":"")+">Price: High to low</option>"+
      "</select>"+
      "<span id='sp-count' style='font-size:11px;color:var(--text-muted)'>"+filtered.length+" / "+SPARES.length+" items</span>"+
    "</div>"+
    "<div style='overflow-x:auto'><table><thead><tr>"+
      "<th>Part name</th><th>Part number</th><th>Customer ref</th>"+
      "<th style='text-align:right'>Unit price</th><th>Terms</th><th>Note</th><th></th>"+
    "</tr></thead>"+
    "<tbody id='sp-tbody'>"+
      (rows||"<tr><td colspan='7' style='text-align:center;padding:20px;color:#aaa'>No results found</td></tr>")+
    "</tbody></table></div>"+
    "</div>";
  var inp=document.getElementById("sp-search");
  if(inp){inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);}
}

function editSpare(i){
  var s=SPARES[i];
  document.getElementById("modal-spares").setAttribute("data-edit-idx",i);
  document.getElementById("spare-modal-title").textContent="Edit spare part / accessory";
  document.getElementById("sp-name").value=s.name||"";
  document.getElementById("sp-pn").value=s.pn||"";
  document.getElementById("sp-price").value=s.price||"";
  document.getElementById("sp-currency").value=s.currency||"USD";
  document.getElementById("sp-customer").value=s.customer||"";
  document.getElementById("sp-terms").value=s.terms||"";
  document.getElementById("sp-note").value=s.note||"";
  var delBtn=document.getElementById("btn-delete-spare");if(delBtn)delBtn.style.display="inline-flex";
  var saveBtn=document.getElementById("btn-save-spare");
  if(saveBtn){saveBtn.textContent="Update entry";saveBtn.onclick=function(){saveSpare(i);};}
  document.getElementById("modal-spares").classList.add("open");
}

async function saveSpare(i){
  var name=document.getElementById("sp-name").value.trim();
  var price=parseFloat(document.getElementById("sp-price").value);
  if(!name||isNaN(price)){alert("Please fill in Part name and Price.");return;}
  var updated={name:name,pn:document.getElementById("sp-pn").value.trim(),price:price,currency:document.getElementById("sp-currency").value,customer:document.getElementById("sp-customer").value.trim(),terms:document.getElementById("sp-terms").value.trim(),note:document.getElementById("sp-note").value.trim()};
  showLoad("Saving...");
  if(i===undefined||i===null){
    var r=await sbInsert("spares",sToDb(updated));
    if(r&&r[0])updated._id=r[0].id;
    SPARES.push(updated);
  } else {
    var existing=SPARES[i];
    if(existing&&existing._id){
      await fetch(SB_URL+"/rest/v1/spares?id=eq."+existing._id,{method:"PATCH",headers:sbH(),body:JSON.stringify(sToDb(updated))});
      updated._id=existing._id;
    }
    SPARES[i]=updated;
  }
  hideLoad();
  closeSpareModal();
  renderContent();
}

async function deleteSpare(i){
  if(!confirm("Remove this entry?"))return;
  var item=SPARES[i];
  showLoad("Deleting...");
  if(item&&item._id)await sbDelete("spares",item._id);
  SPARES.splice(i,1);
  hideLoad();
  renderContent();
}

async function deleteSpareFromModal(){
  var i=parseInt(document.getElementById("modal-spares").getAttribute("data-edit-idx"));
  if(isNaN(i))return;
  if(!confirm("Delete this entry permanently?"))return;
  var item=SPARES[i];
  showLoad("Deleting...");
  if(item&&item._id)await sbDelete("spares",item._id);
  SPARES.splice(i,1);
  hideLoad();
  closeSpareModal();
  renderContent();
}

function closeSpareModal(){
  document.getElementById("modal-spares").removeAttribute("data-edit-idx");
  document.getElementById("spare-modal-title").textContent="Add spare part / accessory";
  var delBtn=document.getElementById("btn-delete-spare");if(delBtn)delBtn.style.display="none";
  var saveBtn=document.getElementById("btn-save-spare");
  if(saveBtn){saveBtn.textContent="Save entry";saveBtn.onclick=function(){saveSpare();};}
  document.getElementById("modal-spares").querySelectorAll("input,textarea").forEach(function(el){el.value="";});
  document.getElementById("sp-terms").value="";
  document.getElementById("sp-currency").value="USD";
  closeModal("modal-spares");
}

function renderContent(){
  if(typeof MD_GROUP_SEL!=="undefined"&&MD_GROUP_SEL){renderProjectGroupView();return;}
  if(currentTab==="customers")renderCustomers();
  else if(currentTab==="groups")renderProjectGroupsList();
  else if(currentTab==="projects")renderProjects();
  else if(currentTab==="model")renderModel();
  else if(currentTab==="buying")renderBuying();
  else if(currentTab==="spares")renderSpares();
  else renderOthers();
}

// ============================================================
// NEW (Stage 2): renderProjects — read-only project + line item view
// ============================================================
let expandedProjects={};
let expandedProjectItems={}; /* per-project line-item expand state (default collapsed) */
function projectTotal(projId){
  return LINE_ITEMS.filter(function(li){return li.projectId===projId;})
    .reduce(function(sum,li){return sum+(li.qty*li.unitPrice);},0);
}
function projectPrinterTotal(projId){
  return LINE_ITEMS.filter(function(li){return li.projectId===projId&&li.type==="printer";})
    .reduce(function(sum,li){return sum+(li.qty*li.unitPrice);},0);
}
function projectPrinterQty(projId){
  return LINE_ITEMS.filter(function(li){return li.projectId===projId&&li.type==="printer"&&!/\bTPH\b/i.test(li.name);})
    .reduce(function(sum,li){return sum+li.qty;},0);
}
function buildProjectBlock(p){
    var lis=LINE_ITEMS.filter(function(li){return li.projectId===p._id;})
      .sort(function(a,b){return a.sortOrder-b.sortOrder;});
    var totalCalc=projectTotal(p._id);
    var printerTot=projectPrinterTotal(p._id);
    var printerQty=projectPrinterQty(p._id);
    var displayTotal=p.totalOverride||totalCalc;

    var lineHtml=lis.map(function(li){
      var subtotal=li.qty*li.unitPrice;
      var typeColor=li.type==="printer"?"#1a3a4a":li.type==="other"?"#856404":"#5a7a8a";
      var typeBg=li.type==="printer"?"#e8f0f4":li.type==="other"?"#fff3cd":"#f5f5f5";
      var qtyDisplay=li.qty===1&&li.type!=="printer"?"":li.qty+" \xd7 ";
      var subtotalDisplay=subtotal.toLocaleString(undefined,{minimumFractionDigits:subtotal%1?2:0,maximumFractionDigits:2});
      var marginInfo="";
      if(li.type==="printer"&&li.buyingPrice&&p.currency==="USD"){
        var m=li.unitPrice-li.buyingPrice;
        var mPct=(m/li.unitPrice*100).toFixed(1);
        marginInfo="<span style='font-size:10px;color:var(--text-faint);margin-left:8px'>(margin $"+m.toFixed(0)+", "+mPct+"%)</span>";
      }
      return "<div style='display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px dashed var(--divider)'>"+
        "<div style='flex:1'>"+
          "<span style='font-size:10px;font-weight:600;text-transform:uppercase;background:"+typeBg+";color:"+typeColor+";padding:2px 6px;border-radius:3px;margin-right:8px'>"+li.type+"</span>"+
          "<span style='font-size:13px;color:var(--text);font-weight:500'>"+li.name+"</span>"+
          (li.pn?"<span style='font-size:10px;color:var(--text-faint);font-family:monospace;margin-left:8px'>"+li.pn+"</span>":"")+
          marginInfo+
        "</div>"+
        "<div style='text-align:right;white-space:nowrap;font-size:13px'>"+
          "<span style='color:var(--text-muted)'>"+qtyDisplay+(li.unitPrice<0?"(":"")+li.unitPrice.toLocaleString()+(li.unitPrice<0?")":"")+" "+p.currency+"</span>"+
          "<span style='font-weight:600;color:var(--text-strong);margin-left:12px;display:inline-block;min-width:90px;text-align:right'>"+(subtotal<0?"\u2212":"")+subtotalDisplay+" "+p.currency+"</span>"+
        "</div>"+
      "</div>";
    }).join("");

    return "<div style='padding:18px;border-bottom:3px solid var(--border-strong);background:var(--bg)'>"+
      "<div onclick='toggleProjItems(\""+p._id+"\")' style='display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;cursor:pointer'>"+
        "<div style='display:flex;gap:10px;align-items:flex-start'>"+
          "<span class='pchev"+(expandedProjectItems[p._id]?" open":"")+"' id='pchev-"+p._id+"'>\u25be</span>"+
          "<div>"+
          "<div style='font-size:11px;color:var(--text-muted);margin-bottom:4px'>"+(p.displayDate||p.date||"")+" \xb7 "+bStatus(p.status)+(printerQty?" \xb7 "+printerQty+" printer"+(printerQty!==1?"s":""):"")+"</div>"+
          "<div style='font-size:14px;font-weight:600;color:var(--text-strong)'>"+p.project+"</div>"+
          (p.projectGroup?"<div style='margin-top:4px'>"+projGroupLinkHtml(p.projectGroup)+"</div>":"")+
          "<div style='margin-top:6px'>"+
            (p.shippingTerms?bTerm(p.shippingTerms):"")+
            bWarranty(p.warranty)+
          "</div>"+
          "</div>"+
        "</div>"+
        "<div style='text-align:right'>"+
          (printerTot!==totalCalc&&printerTot>0?"<div style='font-size:11px;color:var(--text-muted)'>Printer subtotal: "+printerTot.toLocaleString()+" "+p.currency+fxEqSpan(printerTot,p.currency)+"</div>":"")+
          "<div style='font-size:15px;font-weight:600;color:var(--accent-text);margin-top:3px'>Project Total: "+displayTotal.toLocaleString()+" "+p.currency+fxEqSpan(displayTotal,p.currency)+"</div>"+
          (p.currency!=="USD"&&typeof fxNote==="function"&&fxNote(p.currency)?"<div class='fx-note'>"+fxNote(p.currency)+"</div>":"")+
        "</div>"+
      "</div>"+
      "<div id='pitems-"+p._id+"' style='"+(expandedProjectItems[p._id]?"":"display:none;")+"'>"+
        (lineHtml?"<div style='background:var(--bg-soft);border:1px solid var(--divider);border-radius:8px;padding:6px 14px;margin-top:10px'>"+lineHtml+"</div>":"<div style='font-size:12px;color:#aaa;font-style:italic;padding:8px 0'>No line items</div>")+
        (p.notes&&p.notes.length?"<div style='margin-top:10px;font-size:12px;color:var(--text-muted);line-height:1.6'>"+p.notes.map(function(n){return "<div>\u2022 "+n+"</div>";}).join("")+"</div>":"")+
      "</div>"+
      "<div style='display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap;margin-top:10px'>"+
        attClipsHtml(p.attachments)+
        "<button class='edit-btn' onclick='editProject(\""+p._id+"\")'>Edit</button>"+
      "</div>"+
    "</div>";
}
function buildProjectCard(name,projects){
  var country=projects[0].country;
  var flag=FLAGS[country]||"";
  var poCount=projects.filter(function(p){return p.status==="PO";}).length;
  var qtCount=projects.filter(function(p){return p.status!=="PO";}).length;
  var sorted=projects.slice().sort(function(a,b){return parseDV(b.date)-parseDV(a.date);});
  var cardKey="proj__"+name+"__"+country;
  var sid=cardKey.replace(/[^a-zA-Z0-9]/g,"-");
  var isOpen=expandedProjects[cardKey];
  var bodyHtml=sorted.map(buildProjectBlock).join("");

  return "<div class='card'>"+
    "<div class='card-header' onclick='toggleProjectCard(\""+cardKey.replace(/'/g,"\\'")+"\",\""+sid+"\")'>"+
      "<div class='flag-icon'>"+flag+"</div>"+
      "<div style='flex:1'>"+
        "<div class='cname'>"+name+"</div>"+
        "<div class='cmeta'>"+country+" \xb7 "+poCount+" PO"+(poCount!==1?"s":"")+" \xb7 "+qtCount+" quote"+(qtCount!==1?"s":"")+" \xb7 "+projects.length+" project"+(projects.length!==1?"s":"")+"</div>"+
      "</div>"+
      "<div class='chevron "+(isOpen?"open":"")+"' id='chev-"+sid+"'>\u25be</div>"+
    "</div>"+
    "<div class='card-body "+(isOpen?"open":"")+"' id='body-"+sid+"'>"+bodyHtml+"</div>"+
  "</div>";
}
function toggleProjItems(pid){
  expandedProjectItems[pid]=!expandedProjectItems[pid];
  var el=document.getElementById("pitems-"+pid);
  if(el)el.style.display=expandedProjectItems[pid]?"":"none";
  var chev=document.getElementById("pchev-"+pid);
  if(chev)chev.classList.toggle("open",expandedProjectItems[pid]);
}
function toggleProjectCard(key,sid){
  expandedProjects[key]=!expandedProjects[key];
  document.getElementById("body-"+sid).classList.toggle("open",expandedProjects[key]);
  document.getElementById("chev-"+sid).classList.toggle("open",expandedProjects[key]);
}
function renderProjects(){
  if(!PROJECTS.length){
    document.getElementById("content").innerHTML='<div class="empty">No projects found. The new <code>projects</code> table is empty \u2014 did you run Stage 1B migration?</div>';
    return;
  }
  // Group by customer + country
  var byC={};
  PROJECTS.forEach(function(p){
    var k=p.customer+"__"+p.country;
    if(!byC[k])byC[k]=[];
    byC[k].push(p);
  });
  // Group customers by country
  var byCountry={};
  Object.entries(byC).forEach(function(entry){
    var name=entry[0].split("__")[0];
    var projs=entry[1];
    var c=projs[0].country||"Unknown";
    if(!byCountry[c])byCountry[c]=[];
    byCountry[c].push([name,projs]);
  });
  var html="<div style='background:var(--accent-soft);color:var(--accent-text);padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:12px;border:1px solid var(--border-strong)'>"+
    "Quotations with <strong>multiple models / line items</strong> live here \u2014 use <strong>+ Add entry</strong> to create one (printers, accessories, discounts per row, with an attached PDF), or <strong>Edit</strong> on any project below."+
  "</div>";
  Object.entries(byCountry).sort(function(a,b){return a[0].localeCompare(b[0]);}).forEach(function(entry){
    var country=entry[0],list=entry[1];
    list.sort(function(a,b){return a[0].localeCompare(b[0]);});
    var f=flagImg(country,18);
    html+="<div class='country-group-label'>"+f+" "+country+" <span class='country-count'>"+list.length+" customer"+(list.length!==1?"s":"")+"</span></div>";
    list.forEach(function(item){html+=buildProjectCard(item[0],item[1]);});
  });
  document.getElementById("content").innerHTML=html;
}
// ============================================================
// END NEW (Stage 2)
// ============================================================

var SPARE_PARTS=["Autocutter KPM180H 85MM Kyoujin","Cutter Ejector Module KPM180H CN","PCBA CPU KPM180 E12 R2 ST101_DP007 VN UL","New Metal Roll Holder for Bag Tag and GPP Paper (TK180 Plastic)","Roll Holder Kit for TK180 Metal","KPM180 TPH (Thermal Print Head)","TK180 TPH","Roll Holder","Ticket Tray Metal","1.8M USB Cable","USA Plug Power Cable","Paper Roll","On-site installation","Annual maintenance + consumables","Vertical Tray TK302 Metal Case","VKP80II Paper Roll Holder"];

function populateModelSelect(){
  var sel=document.getElementById("f-model");
  if(!sel||sel.tagName!=="SELECT")return;
  var models=getModelList().sort();
  sel.innerHTML="<option value=''>-- Select model --</option>"+models.map(function(m){
    return "<option value='"+m+"'>"+m+"</option>";
  }).join("");
}
function openModal(){
  if(currentTab==="customers"||currentTab==="projects"){
    // New entries are created as projects (line items + PDF parsing).
    // The transaction modal is still used when editing legacy transactions.
    openProjectModal();
  }
  else if(currentTab==="buying"){
    document.getElementById("modal-buying").removeAttribute("data-edit-idx");
    document.getElementById("buying-modal-title").textContent="Add buying price";
    var delBtnB=document.getElementById("btn-delete-buying");if(delBtnB)delBtnB.style.display="none";
    var saveBB=document.getElementById("btn-save-buying");if(saveBB){saveBB.textContent="Save entry";saveBB.onclick=sbSaveBuying;}
    document.getElementById("modal-buying").querySelectorAll("input").forEach(function(el){el.value="";});
    document.getElementById("modal-buying").classList.add("open");
  }
  else if(currentTab==="spares"){
    closeSpareModal();
    // populate customer datalist
    var spcl=document.getElementById("sp-customer-list");
    if(spcl)spcl.innerHTML=[...new Set(SPARES.map(function(s){return s.customer;}).filter(Boolean))].sort().map(function(c){return "<option value='"+c+"'>";}).join("");
    document.getElementById("modal-spares").classList.add("open");
  }
  else if(currentTab==="others"){
    closeOtherModal();
    document.getElementById("modal-others").classList.add("open");
  }
}
function closeModal(id){document.getElementById(id).classList.remove("open");}
document.querySelectorAll(".modal-overlay").forEach(el=>{
  let downOnOverlay=false;
  el.addEventListener("mousedown",e=>{downOnOverlay=(e.target===el);});
  el.addEventListener("click",e=>{if(downOnOverlay&&e.target===el)el.classList.remove("open");});
});
