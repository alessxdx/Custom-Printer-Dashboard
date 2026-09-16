/* ============================================================
   PURCHASE ORDERS — record of every PO our offices send to the
   manufacturer (CUSTOM S.p.A.). No lifecycle tracking: this is a
   register for analytics — units bought per model per year, and
   unit-price changes over time. Line items are stored but rarely
   typed: the ⚡ parser fills them from the PO PDF (the offices'
   PO template is very consistent).
   Tables: purchase_orders + po_lines (cascade delete), lazy-loaded.
   ============================================================ */

var PO_LIST=[],PO_LINES=[];
var PO_LOADED=false,PO_MISSING=false;
var PO_VIEW="pos";           /* "pos" | "models" */
var PO_FOFFICE="",PO_FYEAR="",PO_SEARCH="";
var PO_ATT=[];               /* modal attachment staging */
var PO_EXPANDED={};
var PO_OFFICES=["Indonesia","Shanghai","Singapore"];

/* ===== converters ===== */
function dbToPo(r){return{_id:r.id,poNumber:r.po_number||"",office:r.office||"",date:r.po_date||"",vendor:r.vendor||"CUSTOM S.p.A.",currency:r.currency||"USD",total:(r.total===null||r.total===undefined)?null:Number(r.total),notes:r.notes||"",attachments:Array.isArray(r.attachments)?r.attachments:[],createdAt:r.created_at||""};}
function poToDb(p){return{po_number:p.poNumber,office:p.office||null,po_date:p.date||null,vendor:p.vendor||"CUSTOM S.p.A.",currency:p.currency||"USD",total:(p.total===null||isNaN(p.total))?null:p.total,notes:p.notes||null,attachments:p.attachments||[]};}
function dbToPoLine(r){return{_id:r.id,poId:r.po_id,pn:r.pn||"",description:r.description||"",qty:Number(r.qty)||0,unit:r.unit||"pcs",unitPrice:(r.unit_price===null||r.unit_price===undefined)?null:Number(r.unit_price),sortOrder:Number(r.sort_order)||0};}
function poLineToDb(l){return{po_id:l.poId,pn:l.pn||null,description:l.description||null,qty:l.qty||0,unit:l.unit||"pcs",unit_price:(l.unitPrice===null||isNaN(l.unitPrice))?null:l.unitPrice,sort_order:l.sortOrder||0};}

/* ===== load ===== */
async function poLoad(force){
  if(PO_LOADED&&!force)return true;
  var res=await Promise.all([sbGet("purchase_orders"),sbGet("po_lines")]);
  if(!res[0]||!res[1]){PO_MISSING=true;return false;}
  PO_MISSING=false;
  PO_LIST=res[0].map(dbToPo);
  PO_LINES=res[1].map(dbToPoLine);
  PO_LOADED=true;
  return true;
}
function poLinesFor(id){
  return PO_LINES.filter(function(l){return l.poId===id;})
    .sort(function(a,b){return a.sortOrder-b.sortOrder;});
}
function poYear(p){return p.date?String(p.date).slice(0,4):"";}
function poUsd(v,cur){
  if(v===null||isNaN(v))return null;
  return (typeof fxToUSD==="function")?fxToUSD(v,cur):(cur==="USD"?v:null);
}
function poFmtMoney(v,cur){
  if(v===null||v===undefined||isNaN(v))return "—";
  return v.toLocaleString(undefined,{minimumFractionDigits:v%1?2:0,maximumFractionDigits:2})+" "+cur;
}

/* Debounced search — re-rendering replaces the input, so refocus it */
var PO_SEARCH_T=null;
function poSearchInput(v){
  PO_SEARCH=v;
  clearTimeout(PO_SEARCH_T);
  PO_SEARCH_T=setTimeout(function(){
    renderPOs();
    var el=document.getElementById("po-search");
    if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}
  },250);
}

/* ===== filtering ===== */
function poFiltered(){
  var q=PO_SEARCH.trim().toLowerCase();
  return PO_LIST.filter(function(p){
    if(PO_FOFFICE&&p.office!==PO_FOFFICE)return false;
    if(PO_FYEAR&&poYear(p)!==PO_FYEAR)return false;
    if(q){
      var hay=(p.poNumber+" "+p.office+" "+p.notes+" "+
        poLinesFor(p._id).map(function(l){return l.pn+" "+l.description;}).join(" ")).toLowerCase();
      if(hay.indexOf(q)===-1)return false;
    }
    return true;
  }).sort(function(a,b){
    var d=(b.date||"").localeCompare(a.date||"");
    return d!==0?d:(b.createdAt||"").localeCompare(a.createdAt||"");
  });
}

/* ===== toolbar / stats ===== */
function poSyncToolbar(){
  var btn=document.querySelector("#toolbar .btn-add");
  if(!btn||currentTab!=="po")return;
  if(typeof TRK_BTN_HTML!=="undefined"&&TRK_BTN_HTML===null)TRK_BTN_HTML=btn.innerHTML;
  btn.style.display="";
  if(typeof TRK_BTN_HTML==="string")btn.innerHTML=TRK_BTN_HTML.replace("Add entry","Add PO");
}
function poRenderStats(list){
  var el=document.getElementById("stats");
  if(!el)return;
  var spend=0,units=0,models={};
  list.forEach(function(p){
    var u=poUsd(p.total,p.currency);
    if(u!==null)spend+=u;
    poLinesFor(p._id).forEach(function(l){
      units+=l.qty;
      var k=(l.pn||l.description||"").toLowerCase();
      if(k)models[k]=1;
    });
  });
  var scope=PO_FYEAR?PO_FYEAR:"all years";
  el.innerHTML=
    "<div class='stat'><div class='stat-label'>Purchase orders</div><div class='stat-value'>"+list.length+"</div><div class='stat-sub'>"+scope+(PO_FOFFICE?" · "+PO_FOFFICE:"")+"</div></div>"+
    "<div class='stat'><div class='stat-label'>Total spend</div><div class='stat-value'>"+(typeof fxFormatUSD==="function"?fxFormatUSD(spend):"$"+spend.toLocaleString())+"</div><div class='stat-sub'>USD equivalent</div></div>"+
    "<div class='stat'><div class='stat-label'>Units ordered</div><div class='stat-value'>"+units.toLocaleString()+"</div><div class='stat-sub'>all line items</div></div>"+
    "<div class='stat'><div class='stat-label'>Distinct items</div><div class='stat-value'>"+Object.keys(models).length+"</div><div class='stat-sub'>models / part numbers</div></div>";
}

/* ===== main render ===== */
function renderPOs(){
  var content=document.getElementById("content");
  poSyncToolbar();
  if(!PO_LOADED){
    content.innerHTML="<div class='empty'>Loading purchase orders&hellip;</div>";
    poLoad().then(function(ok){
      if(currentTab!=="po")return;
      if(!ok){
        var st=document.getElementById("stats");if(st)st.innerHTML="";
        content.innerHTML="<div class='empty'>The PO tables don't exist in Supabase yet (purchase_orders / po_lines).<br>Run the setup SQL once in the Supabase SQL editor, then reload.</div>";
        return;
      }
      renderPOs();
    });
    return;
  }
  var list=poFiltered();
  poRenderStats(list);

  var years=[];
  PO_LIST.forEach(function(p){var y=poYear(p);if(y&&years.indexOf(y)===-1)years.push(y);});
  years.sort().reverse();

  var toolbar=
    "<div class='trk-toolbar'>"+
      "<div class='trk-chips'>"+
        "<button class='trk-chip"+(PO_VIEW==="pos"?" active":"")+"' onclick='PO_VIEW=\"pos\";renderPOs()'>PO records</button>"+
        "<button class='trk-chip"+(PO_VIEW==="models"?" active":"")+"' onclick='PO_VIEW=\"models\";renderPOs()'>By model</button>"+
      "</div>"+
      "<div class='po-filters'>"+
        "<input id='po-search' class='po-search' placeholder='Search PO no. / model / PN&hellip;' value='"+trkEsc(PO_SEARCH)+"' oninput='poSearchInput(this.value)'>"+
        "<select class='trk-office-filter' onchange='PO_FYEAR=this.value;renderPOs()'>"+
          "<option value=''"+(PO_FYEAR===""?" selected":"")+">All years</option>"+
          years.map(function(y){return "<option"+(PO_FYEAR===y?" selected":"")+">"+y+"</option>";}).join("")+
        "</select>"+
        "<select class='trk-office-filter' onchange='PO_FOFFICE=this.value;renderPOs()'>"+
          "<option value=''"+(PO_FOFFICE===""?" selected":"")+">All offices</option>"+
          PO_OFFICES.map(function(o){return "<option"+(PO_FOFFICE===o?" selected":"")+">"+o+"</option>";}).join("")+
        "</select>"+
      "</div>"+
    "</div>";

  content.innerHTML=toolbar+(PO_VIEW==="models"?poModelsHtml(list):poListHtml(list));
}

function poListHtml(list){
  if(!list.length)return "<div class='empty'>"+(PO_LIST.length?"No purchase orders match this filter.":"No purchase orders yet. Click <strong>+ Add PO</strong> and drop the PO PDF — the form fills itself.")+"</div>";
  return list.map(function(p){
    var lines=poLinesFor(p._id);
    var open=!!PO_EXPANDED[p._id];
    var atts=(p.attachments||[]).map(function(a){
      return "<a class='trk-att' href='"+trkEsc(a.url)+"' data-name='"+trkEsc(a.name)+"' onclick='event.stopPropagation();return trkViewFile(this)'>"+trkFileIcon(a.name)+" "+trkEsc(a.name)+"</a>";
    }).join(" ");
    var lineRows=lines.map(function(l){
      var sub=(l.unitPrice!==null)?l.qty*l.unitPrice:null;
      return "<div class='po-line'>"+
        "<span class='po-line-qty'>"+l.qty.toLocaleString()+" "+trkEsc(l.unit)+"</span>"+
        "<span class='po-line-pn'>"+trkEsc(l.pn)+"</span>"+
        "<span class='po-line-desc'>"+trkEsc(l.description)+"</span>"+
        "<span class='po-line-price'>"+(l.unitPrice!==null?"@ "+poFmtMoney(l.unitPrice,p.currency):"")+"</span>"+
        "<span class='po-line-sub'>"+(sub!==null?poFmtMoney(sub,p.currency):"")+"</span>"+
      "</div>";
    }).join("");
    return "<div class='trk-card po-card' onclick='poToggle(\""+p._id+"\")'>"+
      "<div class='trk-card-top'>"+
        "<span class='trk-card-name'>"+trkEsc(p.poNumber)+"</span>"+
        "<span class='po-total'>"+poFmtMoney(p.total,p.currency)+
          ((p.currency!=="USD"&&typeof fxUsdText==="function"&&p.total!==null)?" <span class='trk-value-usd'>"+fxUsdText(p.total,p.currency)+"</span>":"")+"</span>"+
      "</div>"+
      "<div class='trk-card-meta'>"+
        (p.office?"<span class='trk-badge trk-office'>"+trkEsc(p.office)+" office</span>":"")+
        (p.date?"<span>"+trkFmtDate(p.date)+"</span>":"")+
        "<span class='trk-value-usd'>"+lines.length+" line"+(lines.length===1?"":"s")+"</span>"+
        "<button class='edit-btn' onclick='event.stopPropagation();poEdit(\""+p._id+"\")'>Edit</button>"+
      "</div>"+
      (atts?"<div class='trk-tl-atts' style='margin-top:9px'>"+atts+"</div>":"")+
      (p.notes?"<div class='trk-card-foot'>"+trkEsc(p.notes)+"</div>":"")+
      (open&&lines.length?"<div class='po-lines'>"+lineRows+"</div>":"")+
    "</div>";
  }).join("");
}
function poToggle(id){PO_EXPANDED[id]=!PO_EXPANDED[id];renderPOs();}

/* ===== "By model" rollup — units and price history per part number ===== */
function poModelsHtml(list){
  var ids={};list.forEach(function(p){ids[p._id]=p;});
  var groups={};
  PO_LINES.forEach(function(l){
    var p=ids[l.poId];
    if(!p)return;
    var key=(l.pn||l.description||"?").toLowerCase();
    var g=groups[key];
    if(!g){g={pn:l.pn,desc:l.description,units:0,pos:{},spend:0,prices:[]};groups[key]=g;}
    if((l.description||"").length>(g.desc||"").length)g.desc=l.description;
    g.units+=l.qty;
    g.pos[l.poId]=1;
    if(l.unitPrice!==null){
      var usd=poUsd(l.unitPrice,p.currency);
      var sub=poUsd(l.qty*l.unitPrice,p.currency);
      if(sub!==null)g.spend+=sub;
      g.prices.push({date:p.date||"",price:l.unitPrice,cur:p.currency,usd:usd});
    }
  });
  var rows=Object.keys(groups).map(function(k){return groups[k];})
    .sort(function(a,b){return b.units-a.units;});
  if(!rows.length)return "<div class='empty'>No line items in the selected range.</div>";

  var html=rows.map(function(g){
    g.prices.sort(function(a,b){return (a.date||"").localeCompare(b.date||"");});
    var first=g.prices[0],last=g.prices[g.prices.length-1];
    var uniq=[];g.prices.forEach(function(pr){if(uniq.indexOf(pr.price)===-1)uniq.push(pr.price);});
    var changed=uniq.length>1;
    var trend="";
    if(changed&&first&&last&&first.price!==last.price){
      var up=last.price>first.price;
      trend=" <span class='"+(up?"po-up":"po-down")+"'>"+(up?"&#9650;":"&#9660;")+" "+
        poFmtMoney(first.price,first.cur)+" &rarr; "+poFmtMoney(last.price,last.cur)+"</span>";
    }
    return "<tr>"+
      "<td><div class='po-m-desc'>"+trkEsc(g.desc||"—")+"</div>"+(g.pn?"<div class='po-m-pn'>"+trkEsc(g.pn)+"</div>":"")+"</td>"+
      "<td class='num'><strong>"+g.units.toLocaleString()+"</strong></td>"+
      "<td class='num'>"+Object.keys(g.pos).length+"</td>"+
      "<td class='num'>"+(typeof fxFormatUSD==="function"?fxFormatUSD(g.spend):"$"+g.spend.toLocaleString())+"</td>"+
      "<td class='num'>"+(last?poFmtMoney(last.price,last.cur):"—")+(last&&last.date?" <span class='trk-value-usd'>("+trkFmtDate(last.date)+")</span>":"")+trend+"</td>"+
    "</tr>";
  }).join("");
  return "<div class='po-table-wrap'><table class='po-table'>"+
    "<thead><tr><th>Model / part</th><th class='num'>Units</th><th class='num'>POs</th><th class='num'>Spend (USD)</th><th class='num'>Last price</th></tr></thead>"+
    "<tbody>"+html+"</tbody></table></div>"+
    "<div class='empty' style='padding:14px;text-align:left'>&#9650;/&#9660; shows a unit-price change between the first and latest PO in the selected range.</div>";
}

/* ===== modal ===== */
function poRenderAttList(){
  var el=document.getElementById("po-att-list");
  if(!el)return;
  el.innerHTML=PO_ATT.map(function(a,i){
    var name=a.url?"<a href='"+trkEsc(a.url)+"' target='_blank' rel='noopener'>"+trkEsc(a.name)+"</a>":trkEsc(a.name)+" <em>(uploads on save)</em>";
    return "<span class='att-item"+(a.url?"":" att-pending")+"'>"+trkFileIcon(a.name)+" "+name+
      " <a href='#' class='att-remove' title='Remove' onclick='poRemoveAtt(event,"+i+")'>&#10005;</a></span>";
  }).join("")||"<span class='att-empty'>No PDF yet. Add or drop the PO — then hit &#9889; to fill the form from it.</span>";
}
function poAddFiles(){
  var input=document.getElementById("po-files");
  var files=input&&input.files?Array.prototype.slice.call(input.files):[];
  files.forEach(function(f){PO_ATT.push({name:f.name||"file",file:f});});
  if(input)input.value="";
  poRenderAttList();
}
function poRemoveAtt(e,i){if(e)e.preventDefault();PO_ATT.splice(i,1);poRenderAttList();}

function polRowHtml(l){
  l=l||{};
  return "<div class='pol-row'>"+
    "<input class='pol-qty' type='number' step='any' placeholder='Qty' value='"+(l.qty!==undefined&&l.qty!==null?l.qty:"")+"' oninput='poRecalc()'>"+
    "<input class='pol-unit' placeholder='pcs' value='"+trkEsc(l.unit||"")+"'>"+
    "<input class='pol-pn' placeholder='Part number' value='"+trkEsc(l.pn||"")+"' style=\"font-family:'DM Mono',monospace\">"+
    "<input class='pol-desc' placeholder='Description / model' value='"+trkEsc(l.description||"")+"'>"+
    "<input class='pol-price' type='number' step='any' placeholder='Unit price' value='"+(l.unitPrice!==undefined&&l.unitPrice!==null?l.unitPrice:"")+"' oninput='poRecalc()'>"+
    "<button type='button' class='pol-del' title='Remove line' onclick='this.parentElement.remove();poRecalc()'>&#10005;</button>"+
  "</div>";
}
function polAddRow(l){
  document.getElementById("pol-rows").insertAdjacentHTML("beforeend",polRowHtml(l));
}
function polReadRows(){
  return [...document.querySelectorAll("#pol-rows .pol-row")].map(function(row,i){
    return {
      qty:parseFloat(row.querySelector(".pol-qty").value)||0,
      unit:row.querySelector(".pol-unit").value.trim()||"pcs",
      pn:row.querySelector(".pol-pn").value.trim(),
      description:row.querySelector(".pol-desc").value.trim(),
      unitPrice:row.querySelector(".pol-price").value===""?null:parseFloat(row.querySelector(".pol-price").value),
      sortOrder:i
    };
  }).filter(function(l){return l.qty||l.pn||l.description;});
}
function poRecalc(){
  var sum=0,any=false;
  polReadRows().forEach(function(l){
    if(l.unitPrice!==null&&!isNaN(l.unitPrice)){sum+=l.qty*l.unitPrice;any=true;}
  });
  if(any)document.getElementById("po-total").value=Math.round(sum*100)/100;
}
function poOpenModal(){
  var m=document.getElementById("modal-po");
  m.removeAttribute("data-edit-id");
  document.getElementById("po-modal-title").textContent="Add purchase order";
  document.getElementById("btn-delete-po").style.display="none";
  m.querySelectorAll("input,textarea").forEach(function(el){el.value="";});
  document.getElementById("po-office").value="";
  document.getElementById("po-currency").value="USD";
  document.getElementById("pol-rows").innerHTML="";
  document.getElementById("po-parse-status").textContent="";
  PO_ATT=[];poRenderAttList();
  m.classList.add("open");
}
function poEdit(id){
  var p=PO_LIST.find(function(x){return x._id===id;});
  if(!p)return;
  var m=document.getElementById("modal-po");
  m.setAttribute("data-edit-id",id);
  document.getElementById("po-modal-title").textContent="Edit purchase order";
  document.getElementById("btn-delete-po").style.display="inline-flex";
  document.getElementById("po-number").value=p.poNumber;
  document.getElementById("po-office").value=p.office||"";
  document.getElementById("po-date").value=p.date?String(p.date).slice(0,10):"";
  document.getElementById("po-currency").value=p.currency||"USD";
  document.getElementById("po-total").value=p.total===null?"":p.total;
  document.getElementById("po-notes").value=p.notes;
  document.getElementById("po-parse-status").textContent="";
  var rows=document.getElementById("pol-rows");
  rows.innerHTML="";
  poLinesFor(id).forEach(function(l){polAddRow(l);});
  var fi=document.getElementById("po-files");if(fi)fi.value="";
  PO_ATT=(p.attachments||[]).map(function(a){return{name:a.name,url:a.url};});
  poRenderAttList();
  m.classList.add("open");
}
async function poSave(){
  var num=document.getElementById("po-number").value.trim();
  if(!num){alert("Please enter the PO number.");return;}
  /* upload staged files (same bucket, po/ prefix) */
  try{
    var pending=PO_ATT.filter(function(a){return a.file&&!a.url;});
    for(var i=0;i<pending.length;i++){
      showLoad("Uploading file "+(i+1)+" of "+pending.length+"...");
      var safe=(pending[i].file.name||"file").replace(/[^a-zA-Z0-9._-]/g,"_");
      var path="po/"+Date.now()+"-"+safe;
      var r0=await fetch(SB_URL+"/storage/v1/object/documents/"+path,{
        method:"POST",
        headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":pending[i].file.type||"application/octet-stream"},
        body:pending[i].file
      });
      if(!r0.ok)throw new Error("upload failed (HTTP "+r0.status+")");
      pending[i].url=SB_URL+"/storage/v1/object/public/documents/"+path;
      delete pending[i].file;
    }
  }catch(err){hideLoad();alert("File upload failed: "+err.message+"\nPO was not saved — please try again.");return;}
  var totRaw=document.getElementById("po-total").value;
  var p={
    poNumber:num,
    office:document.getElementById("po-office").value,
    date:document.getElementById("po-date").value,
    currency:document.getElementById("po-currency").value,
    total:totRaw===""?null:parseFloat(totRaw),
    notes:document.getElementById("po-notes").value.trim(),
    attachments:PO_ATT.map(function(a){return{name:a.name,url:a.url};})
  };
  var lines=polReadRows();
  var m=document.getElementById("modal-po");
  var editId=m.getAttribute("data-edit-id");
  showLoad("Saving...");
  try{
    var poId;
    if(editId){
      var r1=await fetch(SB_URL+"/rest/v1/purchase_orders?id=eq."+editId,{method:"PATCH",headers:sbH(),body:JSON.stringify(poToDb(p))});
      if(!r1.ok)throw new Error("HTTP "+r1.status+" — "+(await r1.text()).slice(0,200));
      poId=editId;
      /* replace the lines wholesale — simplest and safe (they're small) */
      await fetch(SB_URL+"/rest/v1/po_lines?po_id=eq."+editId,{method:"DELETE",headers:sbH()});
      var idx=PO_LIST.findIndex(function(x){return x._id===editId;});
      if(idx>-1){p._id=editId;p.createdAt=PO_LIST[idx].createdAt;PO_LIST[idx]=p;}
      PO_LINES=PO_LINES.filter(function(l){return l.poId!==editId;});
    }else{
      var r=await trkInsert("purchase_orders",poToDb(p));
      if(!r||!r[0])throw new Error("insert failed");
      p._id=r[0].id;p.createdAt=r[0].created_at;poId=p._id;
      PO_LIST.push(p);
    }
    for(var j=0;j<lines.length;j++){
      lines[j].poId=poId;
      var rl=await trkInsert("po_lines",poLineToDb(lines[j]));
      if(rl&&rl[0])lines[j]._id=rl[0].id;
      PO_LINES.push(lines[j]);
    }
  }catch(err){hideLoad();alert("Save failed: "+err.message);return;}
  hideLoad();
  closeModal("modal-po");
  renderPOs();
}
async function poDelete(){
  var m=document.getElementById("modal-po");
  var editId=m.getAttribute("data-edit-id");
  if(!editId)return;
  var p=PO_LIST.find(function(x){return x._id===editId;});
  if(!confirm("Delete PO "+(p?p.poNumber:"")+" and its lines permanently?"))return;
  showLoad("Deleting...");
  await sbDelete("purchase_orders",editId); /* lines cascade */
  PO_LIST=PO_LIST.filter(function(x){return x._id!==editId;});
  PO_LINES=PO_LINES.filter(function(l){return l.poId!==editId;});
  hideLoad();
  closeModal("modal-po");
  renderPOs();
}

/* ===== drag & drop on the PO modal ===== */
(function poInitDrop(){
  var zone=document.getElementById("modal-po");
  var box=document.getElementById("po-drop");
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
    files.forEach(function(f){PO_ATT.push({name:f.name||"file",file:f});});
    if(files.length)poRenderAttList();
  });
})();

/* ===== ⚡ fill the form from the attached PO PDF =====
   The offices' template is consistent:
     "PO NO : CUSTOM013-0925" / "DATE : September 25, 2025"
     item rows: "1 40 Units 915DW011200300 VKP80II-RX $189.00 $7,560.00"
     "TOTAL PRICE $26,382.00" / "TOTAL $ 23,613.00"                     */
function poStatus(msg){var el=document.getElementById("po-parse-status");if(el)el.textContent=msg;}
async function poFillFromPdf(){
  var a=PO_ATT.find(function(x){return x.file&&/\.pdf$/i.test(x.name);})||PO_ATT.find(function(x){return /\.pdf$/i.test(x.name);});
  if(!a){alert("Add the PO PDF first (drop it on the form).");return;}
  poStatus("Reading PDF…");
  try{
    var lines;
    if(a.file){lines=await pdfFileToLines(a.file);}
    else{
      var blob=await(await fetch(a.url)).blob();
      lines=await pdfFileToLines(blob);
    }
    var all=lines.join("\n");
    var m;
    if((m=all.match(/PO\s*NO\s*[:.]?\s*([A-Z0-9#][A-Z0-9#-]+)/i)))document.getElementById("po-number").value=m[1];
    else if((m=String(a.name).match(/([A-Z]{2,}\d{2,}-\d{2,})/)))document.getElementById("po-number").value=m[1];
    if((m=all.match(/DATE\s*:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/))){
      var d=new Date(m[1].replace(",",", "));
      if(!isNaN(d))document.getElementById("po-date").value=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
    }
    if(/SHANGHAI/i.test(all))document.getElementById("po-office").value="Shanghai";
    else if(/GRALESSANDO|SINGAPORE/i.test(all))document.getElementById("po-office").value="Singapore";
    else if(/JAKARTA|INDONESIA/i.test(all))document.getElementById("po-office").value="Indonesia";
    /* line items */
    var rows=document.getElementById("pol-rows");
    var found=[];
    lines.forEach(function(ln){
      var lm=ln.match(/^(\d{1,2})\s+([\d.,]+)\s+(units?|pcs?\.?|sets?|lots?|rolls?|boxes?)\s+([0-9][0-9A-Za-z]{8,})\s+(.+?)\s+\$?\s*([\d,]+\.\d{2})\s+\$?\s*([\d,]+\.\d{2})\s*$/i);
      if(!lm)return;
      found.push({
        qty:parseFloat(lm[2].replace(/,/g,"")),
        unit:lm[3].replace(/\.$/,""),
        pn:lm[4],
        description:lm[5].trim(),
        unitPrice:parseFloat(lm[6].replace(/,/g,""))
      });
    });
    if(found.length){
      rows.innerHTML="";
      found.forEach(function(l){polAddRow(l);});
    }
    if((m=all.match(/TOTAL(?:\s+PRICE)?\s+\$?\s*([\d,]+\.\d{2})/i)))document.getElementById("po-total").value=parseFloat(m[1].replace(/,/g,""));
    else poRecalc();
    poStatus(found.length?("Filled: "+found.length+" line"+(found.length===1?"":"s")+" — check, then save."):"Read the header, but no line items matched — enter lines manually or check the PDF.");
  }catch(err){
    poStatus("Could not read the PDF: "+err.message);
  }
}
