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
function renderStats(){
  const pos=TX.filter(t=>t.status==="PO").length,qt=TX.filter(t=>t.status==="Quotation").length,ls=TX.filter(t=>t.status==="Lose").length;
  const cu=new Set(TX.map(t=>t.customer+"__"+t.country)).size;
  document.getElementById("stats").innerHTML=`
    <div class="stat"><div class="stat-label">Customers</div><div class="stat-value">${cu}</div><div class="stat-sub">across multiple countries</div></div>
    <div class="stat"><div class="stat-label">Confirmed POs</div><div class="stat-value">${pos}</div><div class="stat-sub">transactions</div></div>
    <div class="stat"><div class="stat-label">Open quotations</div><div class="stat-value">${qt}</div><div class="stat-sub">pending</div></div>
    <div class="stat"><div class="stat-label">Lost quotes</div><div class="stat-value">${ls}</div><div class="stat-sub">for reference</div></div>`;
}
function buildCustomerCard(name,txs){
  const country=txs[0].country,flagIcon=FLAGS[country]||"\u{1F310}";
  const cardKey=name+"__"+country,isOpen=expandedCards[cardKey];
  const pos=txs.filter(t=>t.status==="PO").length,qt=txs.filter(t=>t.status!=="PO").length;
  const sorted=[...txs].sort((a,b)=>{
      const aCombined=a.projectGroup&&a.model&&a.model.includes("+");
      const bCombined=b.projectGroup&&b.model&&b.model.includes("+");
      if(a.projectGroup&&b.projectGroup&&a.projectGroup===b.projectGroup){
        if(aCombined&&!bCombined)return -1;
        if(!aCombined&&bCombined)return 1;
      }
      return parseDV(b.date)-parseDV(a.date);
    });
  const rows=sorted.map(tx=>{
    const margin=tx.bp&&tx.currency==="USD"?tx.price-tx.bp:null;
    const mPct=margin?((margin/tx.price)*100).toFixed(1):null;
    const isCombined=tx.projectGroup&&tx.model&&tx.model.includes("+");
    const isSplit=tx.projectGroup&&tx.project&&(tx.project.includes("\u2014 ATB")||tx.project.includes("\u2014 BTP"));
    const grpId=tx.projectGroup?tx.projectGroup.replace(/[^a-zA-Z0-9]/g,"-"):"";
    const groupTag=(()=>{
      if(!tx.projectGroup)return "";
      if(isCombined)return "<div style='margin-bottom:5px'><button class='expand-btn' onclick='toggleGroup(\""+grpId+"\",this,event)'>\u25bc Show individual model entries</button></div>";
      if(isSplit)return "<div style='display:inline-flex;align-items:center;font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:#fff3cd;color:#856404;border:1px solid #ffc107;margin-bottom:5px'>&#128279; Part of: "+tx.projectGroup+"</div>";
      return "";
    })();
    const inner="<div class='tx'><div>"+
      groupTag+
      "<div class='tx-date'>"+(dDisplay(tx)?dDisplay(tx)+" \xb7 ":"")+bStatus(tx.status)+"</div>"+
      "<div class='tx-model'>"+tx.model+" &nbsp;&middot;&nbsp; "+tx.project+" &nbsp;&middot;&nbsp; "+tx.qty+"</div>"+
      (tx.pn?"<div class='tx-pn'>"+tx.pn+"</div>":"")+
      "<div class='tx-badges'>"+tx.terms.map(bTerm).join("")+bWarranty(tx.warranty)+"</div>"+
      (tx.notes.length?"<div class='tx-notes'>"+tx.notes.map(function(n){return "<div class='tx-note'>"+n+"</div>";}).join("")+"</div>":"")+
    "</div>"+
    "<div style='text-align:right;display:flex;flex-direction:column;min-height:100%'>"+
      (tx.dualPrice?
        "<div style='text-align:right;line-height:1.8'>"+
          "<span style='font-size:10px;color:#5a7a8a'>Cutter ARINC</span><br>"+
          "<span style='font-weight:600;font-size:13px;color:#1a3a4a'>"+tx.price.toLocaleString()+" "+tx.currency+"</span><br>"+
          "<span style='font-size:10px;color:#5a7a8a'>Non Cutter ARINC</span><br>"+
          "<span style='font-weight:600;font-size:13px;color:#1a3a4a'>"+tx.dualPrice.toLocaleString()+" "+tx.currency+"</span>"+
        "</div>"
      :
        "<div class='tx-price'>"+tx.price.toLocaleString()+" "+tx.currency+"</div>"
      )+
      (margin!==null?"<div class='tx-margin'>Margin: $"+margin.toFixed(0)+" ("+mPct+"%)</div>":"")+
      (()=>{
        const qm=(tx.qty||"").match(/[0-9]+/);const q=qm?parseInt(qm[0]):null;const printerTot=(q&&q>0)?tx.price*q:null;
        if(tx.totalOverride){
          const pTot=tx.printerTotalOverride||(printerTot&&!tx.noPrinterTotal?printerTot:null);
          if(pTot)return "<div style='font-size:11px;color:#1a3a4a;margin-top:6px;padding-top:5px;border-top:1px solid #c8d8e0'>Printer Total: <strong>"+pTot.toLocaleString()+" "+tx.currency+"</strong></div><div style='font-size:11px;color:#1a3a4a;margin-top:3px'>Project Total: <strong>"+tx.totalOverride.toLocaleString()+" "+tx.currency+"</strong></div>";
          return "<div style='font-size:11px;color:#1a3a4a;margin-top:6px;padding-top:5px;border-top:1px solid #c8d8e0'>Project Total: <strong>"+tx.totalOverride.toLocaleString()+" "+tx.currency+"</strong></div>";
        }
        if(!printerTot)return "";
        if(tx.noPrinterTotal)return "<div style='font-size:11px;color:#1a3a4a;margin-top:6px;padding-top:5px;border-top:1px solid #c8d8e0'>Project Total: <strong>"+printerTot.toLocaleString()+" "+tx.currency+"</strong></div>";
        return "<div style='font-size:11px;color:#1a3a4a;margin-top:6px;padding-top:5px;border-top:1px solid #c8d8e0'>Printer Total: <strong>"+printerTot.toLocaleString()+" "+tx.currency+"</strong></div><div style='font-size:11px;color:#1a3a4a;margin-top:3px'>Project Total: <strong>"+printerTot.toLocaleString()+" "+tx.currency+"</strong></div>";
      })()+
      "<div style='display:flex;justify-content:flex-end;padding-bottom:14px;margin-top:auto;padding-top:8px'>"+
        "<button class='edit-btn' onclick='editTx("+TX.indexOf(tx)+",event)'>Edit</button>"+
      "</div>"+
    "</div></div>";
    return isSplit?"<div class='grp-entry' data-group='"+grpId+"' style='display:none'>"+inner+"</div>":inner;
  }).join("");
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
      <td style="color:#aaa;white-space:nowrap;font-size:12px">${dDisplay(tx)||"\u2014"}</td>
      <td style="font-weight:600;font-family:'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji','Montserrat',sans-serif">${f} ${tx.customer}</td>
      <td style="color:#555;font-size:12px">${tx.project||"\u2014"}</td>
      <td style="color:#888">${tx.country}</td>
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
    var grpTag=b.group?"<div style='font-size:10px;color:#6d28d9;margin-top:2px'>"+b.group+"</div>":"";
    var spCell=b.specialPrice?
      "<td style='text-align:right'><div style='font-weight:600;color:#856404'>$"+b.specialPrice.toFixed(2)+" "+b.currency+"</div><div style='font-size:10px;color:#aaa;margin-top:1px'>"+(b.specialCustomer||"Special")+"</div></td>":
      "<td style='text-align:right;color:#ddd;font-size:12px'>—</td>";
    return "<tr><td style='font-weight:500'>"+b.model+grpTag+"</td><td style='font-size:11px;color:#5a7a8a;font-family:monospace'>"+(b.pn||"—")+"</td><td style='text-align:right;font-weight:600;color:#1a3a4a'>$"+b.price.toFixed(2)+" "+b.currency+"</td>"+spCell+"<td style='text-align:right;white-space:nowrap'><button class='edit-btn' onclick='editBuying("+b._i+")' style='margin-right:8px'>Edit</button><button class='delete-btn' onclick='sbDeleteBuying("+b._i+")'>Remove</button></td></tr>";
  }

  var rows="";
  noGroup.forEach(function(b){rows+=makeRow(b);});
  Object.keys(groups).sort().forEach(function(grp){
    var isExp=!!expandedGroups[grp];
    var grpId=grp.replace(/[^a-zA-Z0-9]/g,"-");
    rows+="<tr style='background:#e8f0f4;cursor:pointer' onclick='toggleBuyGroup(event,this.dataset.grp)' data-grp='"+grp.replace(/'/g,"&apos;")+"'>"+
      "<td colspan='5' style='font-size:11px;font-weight:600;color:#1a3a4a;padding:8px 12px'>"+
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
    "<div style='padding:12px 16px;border-bottom:1px solid #c8d8e0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#e8f0f4'>"+
      "<input id='buy-search' type='text' placeholder='Search model or part number...' oninput='renderBuying()' value='"+searchVal.replace(/'/g,"&#39;")+"' style='font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid #c8d8e0;background:#fff;color:#333;font-family:Montserrat,sans-serif;width:240px'>"+
      "<span style='font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#1a3a4a;margin-left:4px'>Sort</span>"+
      "<select id='buy-sort' onchange='renderBuying()' style='font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid #c8d8e0;background:#fff;color:#333;font-family:Montserrat,sans-serif'>"+
        "<option value='model'"+(sortBuy==="model"?" selected":"")+">Model A–Z</option>"+
        "<option value='price-asc'"+(sortBuy==="price-asc"?" selected":"")+">Price: Low to high</option>"+
        "<option value='price-desc'"+(sortBuy==="price-desc"?" selected":"")+">Price: High to low</option>"+
      "</select>"+
      "<span id='buy-count' style='font-size:11px;color:#5a7a8a'>"+sorted.length+" / "+BUYING.length+" items</span>"+
    "</div>"+
    "<table><thead><tr><th>Model</th><th>Part number</th><th style='text-align:right'>Buying price</th><th style='text-align:right'>Special price</th><th></th></tr></thead>"+
    "<tbody id='buy-tbody'>"+(rows||"<tr><td colspan='5' style='text-align:center;padding:20px;color:#aaa'>No results found</td></tr>")+"</tbody></table>"+
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
      "<td style='font-size:11px;color:#5a7a8a;font-family:monospace'>"+pn+"</td>"+
      "<td style='color:#5a7a8a;font-size:12px'>"+s.customer+"</td>"+
      "<td style='text-align:right;font-weight:600;color:#1a3a4a'>"+s.price.toLocaleString()+" "+s.currency+"</td>"+
      "<td style='font-size:12px;color:#5a7a8a'>"+(s.terms||"—")+"</td>"+
      "<td style='font-size:11px;color:#888;font-style:italic'>"+s.note+"</td>"+
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
    "<div style='padding:12px 16px;border-bottom:1px solid #c8d8e0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#e8f0f4'>"+
      "<input id='sp-search' type='text' placeholder='Search name, part number, customer...' oninput='renderSpares()' value='"+searchVal.replace(/'/g,"&#39;")+"' style='font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid #c8d8e0;background:#fff;color:#333;font-family:Montserrat,sans-serif;width:280px'>"+
      "<span style='font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#1a3a4a;margin-left:4px'>Sort</span>"+
      "<select id='sp-sort' onchange='renderSpares()' style='font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid #c8d8e0;background:#fff;color:#333;font-family:Montserrat,sans-serif'>"+
        "<option value='name'"+(sortVal==="name"?" selected":"")+">Name A–Z</option>"+
        "<option value='customer'"+(sortVal==="customer"?" selected":"")+">Customer A–Z</option>"+
        "<option value='price-asc'"+(sortVal==="price-asc"?" selected":"")+">Price: Low to high</option>"+
        "<option value='price-desc'"+(sortVal==="price-desc"?" selected":"")+">Price: High to low</option>"+
      "</select>"+
      "<span id='sp-count' style='font-size:11px;color:#5a7a8a'>"+filtered.length+" / "+SPARES.length+" items</span>"+
    "</div>"+
    "<table><thead><tr>"+
      "<th>Part name</th><th>Part number</th><th>Customer ref</th>"+
      "<th style='text-align:right'>Unit price</th><th>Terms</th><th>Note</th><th></th>"+
    "</tr></thead>"+
    "<tbody id='sp-tbody'>"+
      (rows||"<tr><td colspan='7' style='text-align:center;padding:20px;color:#aaa'>No results found</td></tr>")+
    "</tbody></table>"+
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
  if(currentTab==="customers")renderCustomers();
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
function projectTotal(projId){
  return LINE_ITEMS.filter(function(li){return li.projectId===projId;})
    .reduce(function(sum,li){return sum+(li.qty*li.unitPrice);},0);
}
function projectPrinterTotal(projId){
  return LINE_ITEMS.filter(function(li){return li.projectId===projId&&li.type==="printer";})
    .reduce(function(sum,li){return sum+(li.qty*li.unitPrice);},0);
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

  var bodyHtml=sorted.map(function(p){
    var lis=LINE_ITEMS.filter(function(li){return li.projectId===p._id;})
      .sort(function(a,b){return a.sortOrder-b.sortOrder;});
    var totalCalc=projectTotal(p._id);
    var printerTot=projectPrinterTotal(p._id);

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
        marginInfo="<span style='font-size:10px;color:#aaa;margin-left:8px'>(margin $"+m.toFixed(0)+", "+mPct+"%)</span>";
      }
      return "<div style='display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px dashed #e0e0e0'>"+
        "<div style='flex:1'>"+
          "<span style='font-size:10px;font-weight:600;text-transform:uppercase;background:"+typeBg+";color:"+typeColor+";padding:2px 6px;border-radius:3px;margin-right:8px'>"+li.type+"</span>"+
          "<span style='font-size:13px;color:#1a3a4a;font-weight:500'>"+li.name+"</span>"+
          (li.pn?"<span style='font-size:10px;color:#888;font-family:monospace;margin-left:8px'>"+li.pn+"</span>":"")+
          marginInfo+
        "</div>"+
        "<div style='text-align:right;white-space:nowrap;font-size:13px'>"+
          "<span style='color:#888'>"+qtyDisplay+(li.unitPrice<0?"(":"")+li.unitPrice.toLocaleString()+(li.unitPrice<0?")":"")+" "+p.currency+"</span>"+
          "<span style='font-weight:600;color:#1a3a4a;margin-left:12px;display:inline-block;min-width:90px;text-align:right'>"+(subtotal<0?"\u2212":"")+subtotalDisplay+" "+p.currency+"</span>"+
        "</div>"+
      "</div>";
    }).join("");

    return "<div style='padding:18px;border-bottom:3px solid #c8d8e0;background:#fff'>"+
      "<div style='display:flex;justify-content:space-between;align-items:start;margin-bottom:10px'>"+
        "<div>"+
          "<div style='font-size:11px;color:#444;margin-bottom:4px'>"+(p.displayDate||p.date||"")+" \xb7 "+bStatus(p.status)+"</div>"+
          "<div style='font-size:14px;font-weight:600;color:#1a3a4a'>"+p.project+"</div>"+
          (p.projectGroup?"<div style='display:inline-flex;align-items:center;font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:#fff3cd;color:#856404;border:1px solid #ffc107;margin-top:4px'>\ud83d\udd17 "+p.projectGroup+"</div>":"")+
          "<div style='margin-top:6px'>"+
            (p.shippingTerms?bTerm(p.shippingTerms):"")+
            bWarranty(p.warranty)+
          "</div>"+
        "</div>"+
        "<div style='text-align:right'>"+
          (printerTot!==totalCalc&&printerTot>0?"<div style='font-size:11px;color:#5a7a8a'>Printer subtotal: "+printerTot.toLocaleString()+" "+p.currency+"</div>":"")+
          "<div style='font-size:15px;font-weight:600;color:#1a3a4a;margin-top:3px'>Project Total: "+totalCalc.toLocaleString()+" "+p.currency+"</div>"+
        "</div>"+
      "</div>"+
      (lineHtml?"<div style='background:#fafbfc;border:1px solid #e8eef2;border-radius:8px;padding:6px 14px;margin-top:10px'>"+lineHtml+"</div>":"<div style='font-size:12px;color:#aaa;font-style:italic;padding:8px 0'>No line items</div>")+
      (p.notes&&p.notes.length?"<div style='margin-top:10px;font-size:12px;color:#444;line-height:1.6'>"+p.notes.map(function(n){return "<div>\u2022 "+n+"</div>";}).join("")+"</div>":"")+
    "</div>";
  }).join("");

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
  var html="<div style='background:#fef3c7;color:#92400e;padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:12px;border:1px solid #fbbf24'>"+
    "<strong>\ud83d\udea7 NEW VIEW (read-only)</strong> \u2014 This is the new Project + Line Items structure migrated from your transactions. "+
    "Compare with the 'By Customer' tab and verify the data looks correct. Once confirmed, edit/delete will be added in Stage 3."+
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
  if(currentTab==="customers"){
    refreshFilterOptions();
    populateModelSelect();
    // Clear all fields before opening for new entry
    document.getElementById("modal-tx").querySelectorAll("input,textarea").forEach(function(el){el.value="";});
    document.getElementById("f-status").value="PO";
    document.getElementById("f-currency").value="USD";
    document.getElementById("f-terms").value="";
    document.getElementById("f-warranty").value="";
    document.getElementById("modal-tx").querySelector(".modal-title").textContent="Add transaction entry";
    document.getElementById("modal-tx").removeAttribute("data-edit-id");
    var delBtn2=document.getElementById("btn-delete-tx");if(delBtn2)delBtn2.style.display="none";
    var saveBtn2=document.getElementById("btn-save-tx");if(saveBtn2){saveBtn2.textContent="Save entry";saveBtn2.onclick=sbSaveTx;}
    document.getElementById("modal-tx").classList.add("open");
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
document.querySelectorAll(".modal-overlay").forEach(el=>{el.addEventListener("click",e=>{if(e.target===el)el.classList.remove("open");});});
