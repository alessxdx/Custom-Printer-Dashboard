/* ============================================================
   MASTER–DETAIL view for "By Customer" (primary view).
   Left: compact searchable customer list (respects the filter
   dropdowns). Right: per-customer rollup (printers by model,
   revenue, quote pipeline) + full history of entries rendered
   with the exact same entry builder as the Cards view, so all
   edge cases (Bohol/Laguindingan combined toggles, dual
   pricing, Nanshan, overrides, TK180 TPH) look identical.
   ============================================================ */
var MD_SEL=null;    /* selected "customer__country" key */
var MD_SEARCH="";
var MD_GROUP_SEL=null; /* selected project-group name, or null */

function mdEscAttr(s){return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/</g,"&lt;");}

/* Parse unit count out of a qty string.
   "234 units" -> 234 · "23 (T4) + 74 (T5) units" -> 97
   "30 units (ATB) + 24 units (BTP)" -> 54 · "TBD"/"Multiple"/"—" -> 0 */
function mdParseUnits(qty){
  if(!qty)return 0;
  var cleaned=String(qty).replace(/\([^)]*\)/g," ");
  var nums=(cleaned.match(/\d[\d,]*/g)||[]).map(function(s){return parseInt(s.replace(/,/g,""),10);}).filter(function(n){return !isNaN(n);});
  if(!nums.length)return 0;
  if(cleaned.indexOf("+")!==-1)return nums.reduce(function(a,b){return a+b;},0);
  return nums[0];
}
function mdIsCombined(tx){return !!(tx.projectGroup&&tx.model&&tx.model.indexOf("+")!==-1);}
function mdIsSplit(tx,txs){
  if(!tx.projectGroup||mdIsCombined(tx))return false;
  return txs.some(function(o){return o!==tx&&o.projectGroup===tx.projectGroup&&mdIsCombined(o);});
}

/* Per-customer rollup.
   - Unit counts by model use the individual (split) entries and skip
     combined "ATB + BTP" entries so nothing is double counted; consumables
     (noPrinterTotal, e.g. TK180 TPH) are excluded from printer counts.
   - Money uses the combined entries (source of truth for grouped project
     totals) and skips their split children. Value per entry:
     totalOverride, else unit price × parsed qty, else unit price. */
/* Override-aware total for a project (By Project entry). */
function mdProjTotal(p){
  if(p.totalOverride)return p.totalOverride;
  return LINE_ITEMS.filter(function(li){return li.projectId===p._id;})
    .reduce(function(s,li){return s+li.qty*li.unitPrice;},0);
}
/* Does a project pass the active By Customer filter dropdowns? */
function mdProjPassesFilters(p){
  var fc=document.getElementById("fc").value;
  var fs=document.getElementById("fs").value;
  var fm=document.getElementById("fm").value;
  if(fc&&p.country!==fc)return false;
  if(fs&&p.status!==fs)return false;
  if(fm&&!LINE_ITEMS.some(function(li){return li.projectId===p._id&&li.type==="printer"&&li.name===fm;}))return false;
  return true;
}
/* Does a transaction pass the active filter dropdowns? */
function mdTxPassesFilters(t){
  var fc=document.getElementById("fc").value,fm=document.getElementById("fm").value,fs=document.getElementById("fs").value;
  return (!fc||t.country===fc)&&(!fm||t.model===fm)&&(!fs||t.status===fs);
}
/* Resolved deals with the filter dropdowns applied. */
function mdFilteredResolved(){
  var R=resolveDeals();
  return {txs:R.txs.filter(mdTxPassesFilters),projs:R.projs.filter(mdProjPassesFilters)};
}
/* Per-customer rollup over transactions AND project-only deals.
   - Transactions: unit counts from split entries (skip combined) and
     money from combined entries (skip splits), as before.
   - Project-only deals: printer units come from their line items,
     money from the project total (override-aware). */
function mdAddPrice(m,cur,qty,unitPrice){
  if(!cur||!(qty>0))return;
  if(!m.priceByCur)m.priceByCur={};
  var p=m.priceByCur[cur]||(m.priceByCur[cur]={qty:0,cost:0});
  p.qty+=qty;p.cost+=qty*unitPrice;
}
/* Weighted-average unit price per currency, e.g. "808 SGD" or "808 SGD / 590 USD". */
function mdUnitPriceDisplay(m){
  if(!m.priceByCur)return "—";
  var curs=Object.keys(m.priceByCur);
  if(!curs.length)return "—";
  return curs.map(function(c){
    var pc=m.priceByCur[c],avg=pc.qty>0?pc.cost/pc.qty:0;
    return avg.toLocaleString(undefined,{maximumFractionDigits:2})+" "+c;
  }).join(" / ");
}
function mdRollup(txs,projs){
  var models={},revenue={},pipeline={},approx=false;
  txs.forEach(function(tx){
    if(!mdIsCombined(tx)&&!tx.noPrinterTotal){
      var u=mdParseUnits(tx.qty);
      if(u>0){
        var m=models[tx.model]||(models[tx.model]={po:0,quote:0,lost:0});
        if(tx.status==="PO")m.po+=u;
        else if(tx.status==="Quotation")m.quote+=u;
        else m.lost+=u;
        mdAddPrice(m,tx.currency,u,tx.price);
      }
    }
    if(!mdIsSplit(tx,txs)){
      var u2=mdParseUnits(tx.qty);
      var val=tx.totalOverride?tx.totalOverride:(u2>0?tx.price*u2:tx.price);
      if(tx.status==="PO"){
        if(!tx.totalOverride&&u2===0)approx=true;
        revenue[tx.currency]=(revenue[tx.currency]||0)+val;
      }else if(tx.status==="Quotation"){
        pipeline[tx.currency]=(pipeline[tx.currency]||0)+val;
      }
    }
  });
  (projs||[]).forEach(function(p){
    LINE_ITEMS.filter(function(li){return li.projectId===p._id&&li.type==="printer"&&li.qty>0&&!/\bTPH\b/i.test(li.name);}).forEach(function(li){
      var m=models[li.name]||(models[li.name]={po:0,quote:0,lost:0});
      if(p.status==="PO")m.po+=li.qty;
      else if(p.status==="Quotation")m.quote+=li.qty;
      else m.lost+=li.qty;
      mdAddPrice(m,p.currency,li.qty,li.unitPrice);
    });
    var val=mdProjTotal(p);
    if(p.status==="PO")revenue[p.currency]=(revenue[p.currency]||0)+val;
    else if(p.status==="Quotation")pipeline[p.currency]=(pipeline[p.currency]||0)+val;
  });
  return{models:models,revenue:revenue,pipeline:pipeline,approx:approx};
}

function mdMoneyLines(map){
  var curs=Object.keys(map);
  if(!curs.length)return "<div class='md-money-line md-money-none'>—</div>";
  var usdTotal=0,allConvertible=true;
  var html=curs.sort().map(function(c){
    var v=map[c],eq=fxUsdText(v,c);
    var usd=fxToUSD(v,c);
    if(usd===null)allConvertible=false;else usdTotal+=usd;
    return "<div class='md-money-line'><span class='md-money-val'>"+v.toLocaleString(undefined,{maximumFractionDigits:2})+" "+c+"</span>"+(eq?" <span class='fx-usd'>"+eq+"</span>":"")+"</div>";
  }).join("");
  if(curs.length>1&&allConvertible){
    html+="<div class='md-money-total'>All currencies ≈ "+fxFormatUSD(usdTotal)+" USD</div>";
  }
  return html;
}

/* Filtered + searched + sorted entries for the left list. Each entry is
   {key,name,country,txs,projs} where projs are project-only deals. */
function mdProjSearchText(p){
  var li=LINE_ITEMS.filter(function(x){return x.projectId===p._id;}).map(function(x){return x.name+" "+(x.pn||"");}).join(" ");
  return (p.customer+" "+p.country+" "+(p.project||"")+" "+(p.projectGroup||"")+" "+li).toLowerCase();
}
function mdComputeEntries(){
  var sortMode=document.getElementById("fsort").value;
  var R=mdFilteredResolved();
  var map={};
  function ent(customer,country){
    var k=customer+"__"+country;
    if(!map[k])map[k]={key:k,name:customer,country:country,txs:[],projs:[]};
    return map[k];
  }
  R.txs.forEach(function(t){ent(t.customer,t.country).txs.push(t);});
  R.projs.forEach(function(p){ent(p.customer,p.country).projs.push(p);});
  var entries=Object.keys(map).map(function(k){return map[k];});
  var q=MD_SEARCH.trim().toLowerCase();
  if(q){
    entries=entries.filter(function(e){
      return e.txs.some(function(t){return (t.customer+" "+t.country+" "+t.model+" "+(t.project||"")+" "+(t.projectGroup||"")+" "+(t.pn||"")).toLowerCase().indexOf(q)!==-1;})
        ||e.projs.some(function(p){return mdProjSearchText(p).indexOf(q)!==-1;});
    });
  }
  function poCount(e){return e.txs.filter(function(t){return t.status==="PO";}).length+e.projs.filter(function(p){return p.status==="PO";}).length;}
  function recent(e){var ds=e.txs.map(function(t){return parseDV(t.date);}).concat(e.projs.map(function(p){return parseDV(p.date);}));return ds.length?Math.max.apply(null,ds):0;}
  if(sortMode==="name")entries.sort(function(a,b){return a.name.localeCompare(b.name);});
  else if(sortMode==="name-desc")entries.sort(function(a,b){return b.name.localeCompare(a.name);});
  else if(sortMode==="po-desc")entries.sort(function(a,b){return poCount(b)-poCount(a);});
  else if(sortMode==="recent")entries.sort(function(a,b){return recent(b)-recent(a);});
  else entries.sort(function(a,b){return a.name.localeCompare(b.name);});
  return entries;
}

function buildMdList(entries){
  if(!entries.length)return "<div class='md-none'>No customers match.</div>";
  var byCountry={};
  entries.forEach(function(e){var c=e.country||"Unknown";if(!byCountry[c])byCountry[c]=[];byCountry[c].push(e);});
  return Object.keys(byCountry).sort().map(function(country){
    var items=byCountry[country].map(function(e){
      var pos=e.txs.filter(function(t){return t.status==="PO";}).length+e.projs.filter(function(p){return p.status==="PO";}).length;
      var qt=e.txs.filter(function(t){return t.status==="Quotation";}).length+e.projs.filter(function(p){return p.status==="Quotation";}).length;
      var ls=e.txs.filter(function(t){return t.status==="Lose";}).length+e.projs.filter(function(p){return p.status==="Lose";}).length;
      var meta=pos+" PO"+(pos!==1?"s":"")+" · "+qt+" quote"+(qt!==1?"s":"")+(ls?" · "+ls+" lost":"");
      return "<div class='md-item"+(e.key===MD_SEL?" active":"")+"' data-key=\""+mdEscAttr(e.key)+"\" onclick='mdSelect(this.getAttribute(\"data-key\"))'>"+
        flagImg(e.country,20)+
        "<div class='md-item-main'>"+
          "<div class='md-item-name'>"+e.name+"</div>"+
          "<div class='md-item-meta'>"+meta+"</div>"+
        "</div>"+
        "<div class='md-item-chev'>›</div>"+
      "</div>";
    }).join("");
    return "<div class='md-country'>"+country+"</div>"+items;
  }).join("");
}

function buildMdDetail(key){
  var R=resolveDeals();
  var txs=R.txs.filter(function(t){return (t.customer+"__"+t.country)===key;});
  var projs=R.projs.filter(function(p){return (p.customer+"__"+p.country)===key;});
  if(!txs.length&&!projs.length)return "<div class='md-empty'>No entries for this customer.</div>";
  var ref=txs[0]||projs[0];
  var name=ref.customer,country=ref.country;
  var r=mdRollup(txs,projs);
  var pos=txs.filter(function(t){return t.status==="PO";}).length+projs.filter(function(p){return p.status==="PO";}).length;
  var qt=txs.filter(function(t){return t.status==="Quotation";}).length+projs.filter(function(p){return p.status==="Quotation";}).length;
  var ls=txs.filter(function(t){return t.status==="Lose";}).length+projs.filter(function(p){return p.status==="Lose";}).length;

  var modelKeys=Object.keys(r.models).sort();
  var anyLost=modelKeys.some(function(m){return r.models[m].lost>0;});
  var totalPo=0,totalQt=0;
  var modelRows=modelKeys.map(function(m){
    var mm=r.models[m];totalPo+=mm.po;totalQt+=mm.quote;
    return "<tr><td>"+m+"</td><td class='num'>"+(mm.po||"—")+"</td><td class='num'>"+(mm.quote||"—")+"</td><td class='num'>"+mdUnitPriceDisplay(mm)+"</td>"+(anyLost?"<td class='num'>"+(mm.lost||"—")+"</td>":"")+"</tr>";
  }).join("");
  var modelsTable=modelKeys.length?
    "<table class='md-models-table'><thead><tr><th>Model</th><th class='num'>PO units</th><th class='num'>Quoted</th><th class='num'>Unit price</th>"+(anyLost?"<th class='num'>Lost</th>":"")+"</tr></thead>"+
    "<tbody>"+modelRows+"</tbody>"+
    "<tfoot><tr><td>Total printers</td><td class='num'>"+totalPo+"</td><td class='num'>"+totalQt+"</td><td></td>"+(anyLost?"<td></td>":"")+"</tr></tfoot></table>"
    :"<div class='md-money-none'>No printer quantities recorded.</div>";

  var curs=[];txs.forEach(function(t){if(curs.indexOf(t.currency)===-1)curs.push(t.currency);});
  projs.forEach(function(p){if(curs.indexOf(p.currency)===-1)curs.push(p.currency);});
  var notes=fxNotesFor(curs);
  var fxBlock=notes.length?"<div class='md-fx-notes'>"+notes.map(function(n){return "<div class='fx-note'>"+n+"</div>";}).join("")+(FX.live?"":"<div class='fx-note'>Live rates unavailable — using stored estimates.</div>")+"</div>":"";

  return ""+
    "<button class='md-back' onclick='mdBack()'>&#8592; All customers</button>"+
    "<div class='md-head'>"+flagImg(country,34)+
      "<div><div class='md-head-name'>"+name+"</div>"+
      "<div class='md-head-meta'>"+country+" · "+pos+" PO"+(pos!==1?"s":"")+" · "+qt+" open quote"+(qt!==1?"s":"")+(ls?" · "+ls+" lost":"")+"</div></div>"+
    "</div>"+
    "<div class='md-grid2'>"+
      "<div class='md-section'>"+
        "<div class='md-section-title'>Revenue — confirmed POs"+(r.approx?" (some quantities unknown)":"")+"</div>"+
        mdMoneyLines(r.revenue)+
      "</div>"+
      "<div class='md-section'>"+
        "<div class='md-section-title'>Open quotation pipeline</div>"+
        mdMoneyLines(r.pipeline)+
      "</div>"+
    "</div>"+
    "<div class='md-section'>"+
      "<div class='md-section-title'>Printers by model</div>"+
      modelsTable+
    "</div>"+
    fxBlock+
    "<div class='md-section md-entries'>"+
      "<div class='md-section-title'>History — quotations &amp; POs ("+hxOrderCount(txs,projs)+" orders)</div>"+
      "<div class='md-entries-body'>"+buildHistoryHtml(txs,projs,"cust-"+key)+"</div>"+
    "</div>";
}

function mdSelect(key){
  MD_SEL=key;
  renderCustomersDetail();
  if(window.matchMedia("(max-width: 980px)").matches){
    var d=document.querySelector(".md-detail");
    if(d)d.scrollIntoView({behavior:"smooth",block:"start"});
  }
}
function mdBack(){MD_SEL=null;renderCustomersDetail();}
function mdSearchInput(v){
  MD_SEARCH=v;
  var el=document.getElementById("md-list-items");
  if(el)el.innerHTML=buildMdList(mdComputeEntries());
}

/* ============================================================
   CONSOLIDATED PROJECT GROUP view.
   Opened by clicking a "🔗 group name" tag (Bohol/Laguindingan-style
   combined+split transactions, or Singapore Pools/Airlines-style
   multi-project groups in the `projects` table). Pulls together every
   entry across the whole dataset that shares tx.projectGroup /
   p.projectGroup, regardless of which customer card it normally lives
   under, and renders it with the exact same entry builders as the
   customer detail (buildTxEntriesHtml / buildProjectBlock) so all edge
   cases and PDF chips look identical.
   ============================================================ */
function mdGroupTotals(txs,projs){
  var totals={};
  txs.forEach(function(t){
    if(mdIsSplit(t,txs))return;
    var v=txValueOf(t);
    totals[t.currency]=(totals[t.currency]||0)+v;
  });
  (projs||[]).forEach(function(p){
    var v=projTotalOf(p);
    totals[p.currency]=(totals[p.currency]||0)+v;
  });
  return totals;
}
function buildProjectGroupSection(name,country,txs,projs){
  var pos=txs.filter(function(t){return t.status==="PO";}).length+projs.filter(function(p){return p.status==="PO";}).length;
  var qt=txs.filter(function(t){return t.status==="Quotation";}).length+projs.filter(function(p){return p.status==="Quotation";}).length;
  var totals=mdGroupTotals(txs,projs);
  return "<div class='md-section' style='margin-bottom:14px'>"+
    "<div style='display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px'>"+flagImg(country,20)+
      "<div style='font-size:15px;font-weight:700;color:var(--text-strong)'>"+name+"</div>"+
      "<div style='font-size:11px;color:var(--text-muted)'>"+pos+" PO"+(pos!==1?"s":"")+" \xb7 "+qt+" quote"+(qt!==1?"s":"")+"</div>"+
    "</div>"+
    "<div style='margin-bottom:10px'>"+mdMoneyLines(totals)+"</div>"+
    "<div class='md-entries-body'>"+buildHistoryHtml(txs,projs,"pgc-"+name+"-"+country,{toolbar:false})+"</div>"+
  "</div>";
}
function buildProjectGroupView(){
  var group=MD_GROUP_SEL;
  var R=resolveDeals();
  var txs=R.txs.filter(function(t){return t.projectGroup===group;});
  var projs=R.projs.filter(function(p){return p.projectGroup===group;});
  if(!txs.length&&!projs.length){
    return "<div class='pg-view'><button class='md-back' onclick='closeProjectGroup()'>&#8592; Back</button>"+
      "<div class='md-empty'>No entries found for project group “"+mdEscAttr(group)+"”.</div></div>";
  }
  var byCustomer={},order=[];
  function ent(customer,country){
    var k=customer+"__"+country;
    if(!byCustomer[k]){byCustomer[k]={name:customer,country:country,txs:[],projs:[]};order.push(k);}
    return byCustomer[k];
  }
  txs.forEach(function(t){ent(t.customer,t.country).txs.push(t);});
  projs.forEach(function(p){ent(p.customer,p.country).projs.push(p);});
  var ref=txs[0]||projs[0];
  var overallTotals=mdGroupTotals(txs,projs);
  var totalPos=txs.filter(function(t){return t.status==="PO";}).length+projs.filter(function(p){return p.status==="PO";}).length;
  var totalQt=txs.filter(function(t){return t.status==="Quotation";}).length+projs.filter(function(p){return p.status==="Quotation";}).length;

  var body;
  if(order.length===1){
    var e=byCustomer[order[0]];
    body="<div class='md-section md-entries'>"+
      "<div class='md-section-title'>Projects in this group ("+hxOrderCount(e.txs,e.projs)+" orders)</div>"+
      "<div class='md-entries-body'>"+buildHistoryHtml(e.txs,e.projs,"pg-"+group)+"</div>"+
    "</div>";
  } else {
    body="<div class='md-section-title' style='margin:0 2px 8px'>By customer</div>"+
      order.map(function(k){var e=byCustomer[k];return buildProjectGroupSection(e.name,e.country,e.txs,e.projs);}).join("");
  }

  return "<div class='pg-view'>"+
    "<button class='md-back' onclick='closeProjectGroup()'>&#8592; Back</button>"+
    "<div class='md-head'>"+flagImg(ref.country,34)+
      "<div><div class='md-head-name'>&#128279; "+group+"</div>"+
      "<div class='md-head-meta'>"+(order.length===1?byCustomer[order[0]].name+" \xb7 ":"")+ref.country+" \xb7 "+totalPos+" PO"+(totalPos!==1?"s":"")+" \xb7 "+totalQt+" open quote"+(totalQt!==1?"s":"")+"</div></div>"+
    "</div>"+
    "<div class='md-section'>"+
      "<div class='md-section-title'>Group total</div>"+
      mdMoneyLines(overallTotals)+
    "</div>"+
    body+
  "</div>";
}
function openProjectGroup(group){
  MD_GROUP_SEL=group;
  renderContent();
  window.scrollTo(0,0);
}
function closeProjectGroup(){
  MD_GROUP_SEL=null;
  renderContent();
}
function renderProjectGroupView(){
  document.getElementById("content").innerHTML=buildProjectGroupView();
}

/* ============================================================
   "Project Groups" workspace — a top-level tab listing every
   distinct project group across the whole dataset (spanning all
   customers), so groups can be discovered without having to find
   a 🔗 badge buried inside a customer's history first. Clicking a
   row opens the same buildProjectGroupView() consolidated page.
   ============================================================ */
var PG_SEARCH="";
function computeProjectGroups(){
  var R=resolveDeals();
  var map={},order=[];
  function ent(g){
    if(!map[g]){map[g]={name:g,customers:{},country:"",txs:[],projs:[]};order.push(g);}
    return map[g];
  }
  R.txs.forEach(function(t){if(!t.projectGroup)return;var e=ent(t.projectGroup);e.txs.push(t);e.customers[t.customer]=true;if(!e.country)e.country=t.country;});
  R.projs.forEach(function(p){if(!p.projectGroup)return;var e=ent(p.projectGroup);e.projs.push(p);e.customers[p.customer]=true;if(!e.country)e.country=p.country;});
  return order.map(function(g){return map[g];});
}
function pgTotalsCompact(totals){
  var curs=Object.keys(totals);
  if(!curs.length)return "<span style='color:var(--text-faint);font-size:12px'>—</span>";
  return curs.sort().map(function(c){
    return "<div style='font-weight:600;color:var(--accent-text);font-size:13px;white-space:nowrap'>"+totals[c].toLocaleString(undefined,{maximumFractionDigits:0})+" "+c+"</div>";
  }).join("");
}
function pgSearchInput(v){
  PG_SEARCH=v;
  renderProjectGroupsList();
  var el=document.getElementById("pg-search");
  if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}
}
function renderProjectGroupsList(){
  var all=computeProjectGroups();
  if(!all.length){
    document.getElementById("content").innerHTML="<div class='empty'>No project groups yet. Set a “project group” on an entry (Add/Edit) to link related projects together and see them here.</div>";
    return;
  }
  var q=PG_SEARCH.trim().toLowerCase();
  var groups=all.filter(function(g){
    if(!q)return true;
    return g.name.toLowerCase().indexOf(q)!==-1||Object.keys(g.customers).some(function(c){return c.toLowerCase().indexOf(q)!==-1;});
  });
  groups.sort(function(a,b){return a.name.localeCompare(b.name);});

  var rows=groups.map(function(g){
    var totals=mdGroupTotals(g.txs,g.projs);
    var pos=g.txs.filter(function(t){return t.status==="PO";}).length+g.projs.filter(function(p){return p.status==="PO";}).length;
    var qt=g.txs.filter(function(t){return t.status==="Quotation";}).length+g.projs.filter(function(p){return p.status==="Quotation";}).length;
    var custNames=Object.keys(g.customers).sort().join(", ");
    var entryCount=g.txs.length+g.projs.length;
    var esc=String(g.name).replace(/\\/g,"\\\\").replace(/'/g,"\\'");
    return "<div class='card'>"+
      "<div class='card-header' onclick=\"openProjectGroup('"+esc+"')\">"+
        "<div class='flag-icon'>"+flagImg(g.country,22)+"</div>"+
        "<div style='flex:1;min-width:0'>"+
          "<div class='cname'>&#128279; "+g.name+"</div>"+
          "<div class='cmeta'>"+custNames+" \xb7 "+entryCount+" entr"+(entryCount!==1?"ies":"y")+" \xb7 "+pos+" PO"+(pos!==1?"s":"")+" \xb7 "+qt+" quote"+(qt!==1?"s":"")+"</div>"+
        "</div>"+
        "<div style='text-align:right;flex-shrink:0;margin-left:12px'>"+pgTotalsCompact(totals)+"</div>"+
        "<div class='chevron'>&#8250;</div>"+
      "</div>"+
    "</div>";
  }).join("");

  document.getElementById("content").innerHTML=
    "<input id='pg-search' class='md-search' type='text' placeholder='Search project groups or customers…' value=\""+mdEscAttr(PG_SEARCH)+"\" oninput='pgSearchInput(this.value)' style='margin-bottom:14px;max-width:360px'>"+
    "<div id='pg-list-items'>"+(rows||"<div class='empty'>No project groups match your search.</div>")+"</div>";
}

function renderCustomersDetail(){
  var entries=mdComputeEntries();
  if(!entries.length&&!MD_SEARCH){
    document.getElementById("content").innerHTML='<div class="empty">No transactions match your filters.</div>';
    return;
  }
  var keys=entries.map(function(e){return e.key;});
  if(MD_SEL&&keys.indexOf(MD_SEL)===-1)MD_SEL=null;
  if(!MD_SEL&&keys.length&&!window.matchMedia("(max-width: 980px)").matches)MD_SEL=keys[0];

  document.getElementById("content").innerHTML=
    "<div class='md-layout"+(MD_SEL?" md-has-sel":"")+"'>"+
      "<div class='md-list'>"+
        "<input id='md-search' class='md-search' type='text' placeholder='Search customers, models, projects…' value=\""+mdEscAttr(MD_SEARCH)+"\" oninput='mdSearchInput(this.value)'>"+
        "<div id='md-list-items'>"+buildMdList(entries)+"</div>"+
      "</div>"+
      "<div class='md-detail'>"+
        (MD_SEL?buildMdDetail(MD_SEL):"<div class='md-empty'>Select a customer to see rollup and full history.</div>")+
      "</div>"+
    "</div>";
}
