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
function mdRollup(txs){
  var models={},revenue={},pipeline={},approx=false;
  txs.forEach(function(tx){
    if(!mdIsCombined(tx)&&!tx.noPrinterTotal){
      var u=mdParseUnits(tx.qty);
      if(u>0){
        var m=models[tx.model]||(models[tx.model]={po:0,quote:0,lost:0});
        if(tx.status==="PO")m.po+=u;
        else if(tx.status==="Quotation")m.quote+=u;
        else m.lost+=u;
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

/* Filtered + searched + sorted [key, txs] entries for the left list */
function mdComputeEntries(){
  var data=getFiltered();
  var sortMode=document.getElementById("fsort").value;
  var byC={};
  data.forEach(function(t){var k=t.customer+"__"+t.country;if(!byC[k])byC[k]=[];byC[k].push(t);});
  var entries=Object.entries(byC);
  var q=MD_SEARCH.trim().toLowerCase();
  if(q){
    entries=entries.filter(function(e){
      return e[1].some(function(t){
        return (t.customer+" "+t.country+" "+t.model+" "+(t.project||"")+" "+(t.projectGroup||"")+" "+(t.pn||"")).toLowerCase().indexOf(q)!==-1;
      });
    });
  }
  if(sortMode==="name")entries.sort(function(a,b){return a[1][0].customer.localeCompare(b[1][0].customer);});
  else if(sortMode==="name-desc")entries.sort(function(a,b){return b[1][0].customer.localeCompare(a[1][0].customer);});
  else if(sortMode==="po-desc")entries.sort(function(a,b){return b[1].filter(function(t){return t.status==="PO";}).length-a[1].filter(function(t){return t.status==="PO";}).length;});
  else if(sortMode==="recent")entries.sort(function(a,b){return Math.max.apply(null,b[1].map(function(t){return parseDV(t.date);}))-Math.max.apply(null,a[1].map(function(t){return parseDV(t.date);}));});
  return entries;
}

function buildMdList(entries){
  if(!entries.length)return "<div class='md-none'>No customers match.</div>";
  var byCountry={};
  entries.forEach(function(e){var c=e[1][0].country||"Unknown";if(!byCountry[c])byCountry[c]=[];byCountry[c].push(e);});
  return Object.keys(byCountry).sort().map(function(country){
    var items=byCountry[country].map(function(e){
      var key=e[0],txs=e[1],name=txs[0].customer;
      var pos=txs.filter(function(t){return t.status==="PO";}).length;
      var qt=txs.filter(function(t){return t.status==="Quotation";}).length;
      var ls=txs.filter(function(t){return t.status==="Lose";}).length;
      var meta=pos+" PO"+(pos!==1?"s":"")+" · "+qt+" quote"+(qt!==1?"s":"")+(ls?" · "+ls+" lost":"");
      return "<div class='md-item"+(key===MD_SEL?" active":"")+"' data-key=\""+mdEscAttr(key)+"\" onclick='mdSelect(this.getAttribute(\"data-key\"))'>"+
        flagImg(txs[0].country,20)+
        "<div class='md-item-main'>"+
          "<div class='md-item-name'>"+name+"</div>"+
          "<div class='md-item-meta'>"+meta+"</div>"+
        "</div>"+
        "<div class='md-item-chev'>›</div>"+
      "</div>";
    }).join("");
    return "<div class='md-country'>"+country+"</div>"+items;
  }).join("");
}

function buildMdDetail(key){
  var txs=TX.filter(function(t){return (t.customer+"__"+t.country)===key;});
  if(!txs.length)return "<div class='md-empty'>No entries for this customer.</div>";
  var name=txs[0].customer,country=txs[0].country;
  var r=mdRollup(txs);
  var pos=txs.filter(function(t){return t.status==="PO";}).length;
  var qt=txs.filter(function(t){return t.status==="Quotation";}).length;
  var ls=txs.filter(function(t){return t.status==="Lose";}).length;

  var modelKeys=Object.keys(r.models).sort();
  var anyLost=modelKeys.some(function(m){return r.models[m].lost>0;});
  var totalPo=0,totalQt=0;
  var modelRows=modelKeys.map(function(m){
    var mm=r.models[m];totalPo+=mm.po;totalQt+=mm.quote;
    return "<tr><td>"+m+"</td><td class='num'>"+(mm.po||"—")+"</td><td class='num'>"+(mm.quote||"—")+"</td>"+(anyLost?"<td class='num'>"+(mm.lost||"—")+"</td>":"")+"</tr>";
  }).join("");
  var modelsTable=modelKeys.length?
    "<table class='md-models-table'><thead><tr><th>Model</th><th class='num'>PO units</th><th class='num'>Quoted</th>"+(anyLost?"<th class='num'>Lost</th>":"")+"</tr></thead>"+
    "<tbody>"+modelRows+"</tbody>"+
    "<tfoot><tr><td>Total printers</td><td class='num'>"+totalPo+"</td><td class='num'>"+totalQt+"</td>"+(anyLost?"<td></td>":"")+"</tr></tfoot></table>"
    :"<div class='md-money-none'>No printer quantities recorded.</div>";

  var curs=[];txs.forEach(function(t){if(curs.indexOf(t.currency)===-1)curs.push(t.currency);});
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
      "<div class='md-section-title'>History — quotations &amp; POs ("+txs.length+" entries)</div>"+
      "<div class='md-entries-body'>"+buildTxEntriesHtml(txs)+"</div>"+
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

function renderCustomersDetail(){
  var entries=mdComputeEntries();
  if(!entries.length&&!MD_SEARCH){
    document.getElementById("content").innerHTML='<div class="empty">No transactions match your filters.</div>';
    return;
  }
  var keys=entries.map(function(e){return e[0];});
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
