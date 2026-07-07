/* ============================================================
   NOTION-STYLE UI EXTENSIONS
   - sidebar nav (replaces .tab)
   - theme toggle (light/dark)
   - view mode toggle (table/cards) for By Customer
   - inline-editable cells in table view (with Supabase sync)
   ============================================================ */

/* page title strings per tab */
var TAB_TITLES = {
  customers: "By Customer",
  projects: "By Project",
  model: "Model Comparison",
  buying: "Buying Prices",
  spares: "Spare Parts / Accessories",
  others: "Notes"
};

/* Override setTab to drive sidebar instead of top tabs */
function setTab(btn){
  document.querySelectorAll(".nav-item[data-tab]").forEach(function(b){b.classList.remove("active");});
  btn.classList.add("active");
  currentTab = btn.dataset.tab;
  var title = document.getElementById("page-title");
  if(title) title.textContent = TAB_TITLES[currentTab] || "";

  // Show filter bar & view toggle only on customers tab
  document.getElementById("filter-bar").style.display = currentTab === "customers" ? "flex" : "none";
  var vt = document.getElementById("view-toggle");
  if(vt) vt.style.display = currentTab === "customers" ? "inline-flex" : "none";

  // Close mobile sidebar after selection
  closeMobileSidebar();

  renderContent();
}

/* ===== THEME ===== */
var THEME_ORDER = ["light","navy","dark"];
function applyTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  document.body.setAttribute("data-theme", t);
  try { localStorage.setItem("cpd_theme", t); } catch(e){}
  document.querySelectorAll(".theme-swatch").forEach(function(el){
    el.classList.toggle("active", el.dataset.themeChoice === t);
  });
}
function toggleTheme(){
  var cur = document.documentElement.getAttribute("data-theme") || "light";
  var idx = THEME_ORDER.indexOf(cur);
  applyTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
}
function setThemeChoice(t){ applyTheme(t); }
(function initTheme(){
  // Always start light per user preference; if user toggled this session, respect it
  var saved = null;
  try { saved = localStorage.getItem("cpd_theme"); } catch(e){}
  applyTheme(saved || "light");
})();

/* ===== SIDEBAR ===== */
function toggleSidebar(){
  // On mobile: open the panel rather than collapse-mode
  if(window.matchMedia("(max-width: 900px)").matches){
    openMobileSidebar();
    return;
  }
  var sb = document.getElementById("sidebar");
  sb.classList.toggle("collapsed");
  try { localStorage.setItem("cpd_sidebar", sb.classList.contains("collapsed") ? "1" : "0"); } catch(e){}
}
function openMobileSidebar(){
  document.getElementById("sidebar").classList.add("mobile-open");
  document.getElementById("mobile-overlay").classList.add("show");
}
function closeMobileSidebar(){
  var sb = document.getElementById("sidebar");
  if(sb) sb.classList.remove("mobile-open");
  var ov = document.getElementById("mobile-overlay");
  if(ov) ov.classList.remove("show");
}
(function initSidebar(){
  try {
    if(localStorage.getItem("cpd_sidebar") === "1"){
      document.getElementById("sidebar").classList.add("collapsed");
    }
  } catch(e){}
})();

/* ===== VIEW MODE (details / table / cards) =====
   "detail" (master–detail) is the primary view. Stored under a new
   key (cpd_view2) so everyone lands on the new view once, while
   later choices still persist. */
var VIEW_MODE = "detail";
try {
  var saved = localStorage.getItem("cpd_view2");
  if(saved === "cards" || saved === "table" || saved === "detail") VIEW_MODE = saved;
} catch(e){}

function setView(mode){
  VIEW_MODE = mode;
  try { localStorage.setItem("cpd_view2", mode); } catch(e){}
  document.querySelectorAll(".view-toggle-btn").forEach(function(b){
    b.classList.toggle("active", b.dataset.view === mode);
  });
  if(currentTab === "customers") renderCustomers();
}
(function initViewButtons(){
  // sync button active state with saved view
  document.querySelectorAll(".view-toggle-btn").forEach(function(b){
    b.classList.toggle("active", b.dataset.view === VIEW_MODE);
  });
  // the toggle starts hidden in the HTML; show it on load since the
  // initial tab is "customers"
  var vt = document.getElementById("view-toggle");
  if(vt && currentTab === "customers") vt.style.display = "inline-flex";
})();

/* ============================================================
   CUSTOMER VIEW DISPATCHER
   We rename the original renderCustomers -> renderCustomersCards
   and define a new renderCustomers that dispatches by VIEW_MODE.
   ============================================================ */
var renderCustomersCards = renderCustomers;
renderCustomers = function(){
  if(VIEW_MODE === "table") renderCustomersTable();
  else if(VIEW_MODE === "cards") renderCustomersCards();
  else renderCustomersDetail();
};

/* ============================================================
   TABLE VIEW for "By Customer"
   - All transactions in a flat table
   - Filters/sort from existing controls still work
   - Inline-edit on every editable cell
   ============================================================ */
function renderCustomersTable(){
  var data = getFiltered();
  var sortMode = document.getElementById("fsort").value;

  if(sortMode === "name") data = data.slice().sort(function(a,b){return a.customer.localeCompare(b.customer);});
  else if(sortMode === "name-desc") data = data.slice().sort(function(a,b){return b.customer.localeCompare(a.customer);});
  else if(sortMode === "po-desc") data = data.slice().sort(function(a,b){
    var sa = a.status === "PO" ? 0 : 1, sb = b.status === "PO" ? 0 : 1;
    if(sa !== sb) return sa - sb;
    return parseDV(b.date) - parseDV(a.date);
  });
  else if(sortMode === "recent") data = data.slice().sort(function(a,b){return parseDV(b.date) - parseDV(a.date);});
  else data = data.slice().sort(function(a,b){return a.customer.localeCompare(b.customer);});

  if(!data.length){
    document.getElementById("content").innerHTML = '<div class="empty">No transactions match your filters.</div>';
    return;
  }

  var rows = data.map(function(tx){
    var idx = TX.indexOf(tx);
    var margin = (tx.bp && tx.currency === "USD") ? (tx.price - tx.bp) : null;
    var mPct = margin !== null ? ((margin / tx.price) * 100).toFixed(1) : null;
    var flag = flagImg(tx.country, 16);
    var dateStr = dDisplay(tx) || "—";
    var priceCell;
    if(tx.dualPrice){
      priceCell = "<div style='line-height:1.4'>"+
        "<div>"+tx.price.toLocaleString()+" "+tx.currency+"</div>"+
        "<div style='font-size:11px;color:var(--text-muted)'>"+tx.dualPrice.toLocaleString()+" "+tx.currency+"</div>"+
      "</div>";
    } else {
      priceCell = "<span class='cell-edit cell-money' data-tx-idx='"+idx+"' data-field='price' data-type='number'>"+tx.price.toLocaleString()+"</span> "+tx.currency;
    }
    var notesPreview = (tx.notes && tx.notes.length) ? tx.notes[0] + (tx.notes.length > 1 ? " (+"+(tx.notes.length-1)+")" : "") : "";

    return "<tr class='tx-row' data-tx-idx='"+idx+"' onclick='toggleTableRow("+idx+",event)'>"+
      "<td class='cell-mut' style='white-space:nowrap'>"+
        "<span class='cell-edit' data-tx-idx='"+idx+"' data-field='date'>"+(dateStr === "—" ? "—" : dateStr)+"</span>"+
      "</td>"+
      "<td class='cell-cust' style='white-space:nowrap'>"+
        "<div style='display:flex;align-items:center;gap:8px'>"+flag+
        "<span class='cell-edit' data-tx-idx='"+idx+"' data-field='customer'>"+tx.customer+"</span></div>"+
      "</td>"+
      "<td class='cell-mut'>"+
        "<span class='cell-edit' data-tx-idx='"+idx+"' data-field='country'>"+tx.country+"</span>"+
      "</td>"+
      "<td>"+
        "<span class='cell-edit' data-tx-idx='"+idx+"' data-field='model'>"+tx.model+"</span>"+
      "</td>"+
      "<td class='cell-mut'>"+
        "<span class='cell-edit' data-tx-idx='"+idx+"' data-field='project'>"+(tx.project || "—")+"</span>"+
      "</td>"+
      "<td class='cell-mut'>"+
        "<span class='cell-edit' data-tx-idx='"+idx+"' data-field='qty'>"+(tx.qty || "—")+"</span>"+
      "</td>"+
      "<td>"+bStatus(tx.status)+"</td>"+
      "<td>"+(tx.terms && tx.terms.length ? tx.terms.map(bTerm).join("") : "")+bWarranty(tx.warranty)+"</td>"+
      "<td class='num cell-money'>"+priceCell+"</td>"+
      "<td class='num cell-margin'>"+(margin !== null ? "$"+margin.toFixed(0)+" ("+mPct+"%)" : "—")+"</td>"+
      "<td class='num'><div class='row-actions'>"+
        (tx.pdfUrl?"<a class='pdf-clip' href='"+tx.pdfUrl+"' target='_blank' rel='noopener' onclick='event.stopPropagation()' title='Open attached PDF in a new tab'>&#128206;</a>":"")+
        "<button class='edit-btn' onclick='event.stopPropagation();editTx("+idx+",event)'>Edit</button>"+
      "</div></td>"+
    "</tr>"+
    "<tr class='exp-detail' id='trow-"+idx+"'>"+
      "<td colspan='11'>"+
        (tx.pn ? "<div><strong>PN:</strong> <span class='cell-edit cell-pn' data-tx-idx='"+idx+"' data-field='pn'>"+tx.pn+"</span></div>" : "")+
        (tx.projectGroup ? "<div style='margin-top:4px'><span class='proj-group-tag'>🔗 "+tx.projectGroup+"</span></div>" : "")+
        (tx.notes && tx.notes.length ? "<div style='margin-top:4px'>"+tx.notes.map(function(n){return "<div>• "+n+"</div>";}).join("")+"</div>" : "")+
      "</td>"+
    "</tr>";
  }).join("");

  document.getElementById("content").innerHTML =
    "<div class='tx-table-wrap'>"+
      "<div style='overflow-x:auto'>"+
        "<table class='tx-table'>"+
          "<thead><tr>"+
            "<th>Date</th>"+
            "<th>Customer</th>"+
            "<th>Country</th>"+
            "<th>Model</th>"+
            "<th>Project</th>"+
            "<th>Qty</th>"+
            "<th>Status</th>"+
            "<th>Terms</th>"+
            "<th class='num'>Unit price</th>"+
            "<th class='num'>Margin</th>"+
            "<th></th>"+
          "</tr></thead>"+
          "<tbody>"+rows+"</tbody>"+
        "</table>"+
      "</div>"+
    "</div>"+
    "<div style='font-size:11px;color:var(--text-faint);margin-top:10px;padding:0 4px'>"+
      data.length+" entries · Click any cell to edit · Click row to see details"+
    "</div>";

  // Wire up inline edit
  document.querySelectorAll(".cell-edit").forEach(function(el){
    el.addEventListener("click", function(e){
      e.stopPropagation();
      startInlineEdit(el);
    });
  });
}

function toggleTableRow(idx, e){
  // Don't toggle if user clicked an editable cell or a button
  if(e && e.target && (e.target.classList.contains("cell-edit") || e.target.closest(".cell-edit") || e.target.closest("button"))) return;
  var row = document.getElementById("trow-"+idx);
  if(row) row.classList.toggle("open");
}

/* ============================================================
   INLINE EDIT
   ============================================================ */
var INLINE_EDITING = null;

function startInlineEdit(el){
  if(INLINE_EDITING) return;
  var txIdx = parseInt(el.dataset.txIdx);
  var field = el.dataset.field;
  var type = el.dataset.type || "text";
  var tx = TX[txIdx];
  if(!tx) return;

  var current = tx[field];
  if(current === null || current === undefined) current = "";

  INLINE_EDITING = { el: el, txIdx: txIdx, field: field, original: el.textContent };

  el.classList.add("editing");
  el.setAttribute("contenteditable", "true");
  el.textContent = (type === "number" && typeof current === "number") ? String(current) : String(current);
  el.focus();

  // Select all text
  var sel = window.getSelection();
  var range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);

  el.addEventListener("blur", finishInlineEdit, { once: true });
  el.addEventListener("keydown", function onKey(e){
    if(e.key === "Enter"){ e.preventDefault(); el.blur(); }
    else if(e.key === "Escape"){
      el.textContent = INLINE_EDITING ? INLINE_EDITING.original : "";
      INLINE_EDITING = null;
      el.removeAttribute("contenteditable");
      el.classList.remove("editing");
      el.removeEventListener("keydown", onKey);
    }
  });
}

async function finishInlineEdit(){
  if(!INLINE_EDITING) return;
  var info = INLINE_EDITING;
  INLINE_EDITING = null;
  var el = info.el;
  el.removeAttribute("contenteditable");
  el.classList.remove("editing");

  var newVal = el.textContent.trim();
  var tx = TX[info.txIdx];
  if(!tx) return;

  var field = info.field;
  var oldVal = tx[field];
  var oldStr = (oldVal === null || oldVal === undefined) ? "" : String(oldVal);

  // Coerce numeric fields
  if(field === "price" || field === "bp"){
    var cleaned = newVal.replace(/,/g, "");
    var num = parseFloat(cleaned);
    if(isNaN(num) || num <= 0){
      el.textContent = info.original;
      return;
    }
    if(num === oldVal){ el.textContent = info.original; return; }
    tx[field] = num;
    el.textContent = num.toLocaleString();
  } else {
    if(newVal === oldStr){ el.textContent = info.original; return; }
    if(!newVal && (field === "customer" || field === "country" || field === "model")){
      // required field — revert
      el.textContent = info.original;
      return;
    }
    tx[field] = newVal;
    el.textContent = newVal || "—";
  }

  // Persist to Supabase
  if(tx._id){
    try {
      showLoad("Saving...");
      await fetch(SB_URL + "/rest/v1/transactions?id=eq." + tx._id, {
        method: "PATCH", headers: sbH(),
        body: JSON.stringify(txToDb(tx))
      });
    } catch(err){
      console.error("Inline save failed:", err);
      alert("Save failed. Will retry on next edit.");
    }
    hideLoad();
  }

  // Refresh stats/filters since something might have changed
  refreshFilterOptions();
  renderStats();
  // If a critical sort field changed and we're sorted by it, re-render row order
  if(field === "customer" || field === "country" || field === "date" || field === "status"){
    renderCustomersTable();
  }
}

/* ============================================================
   Load brand logo from base64 into top-right
   ============================================================ */
(function setBrandLogo(){
  var img = document.getElementById("brand-logo");
  if(img && window.__CUSTOM_LOGO__) img.src = window.__CUSTOM_LOGO__;
})();
loadFromDB();
