/* ============================================================
   QUOTATION PDF PARSER (client-side, no backend)
   Reads a CUSTOM quotation PDF with pdf.js (lazy-loaded from
   CDN) and pre-fills the By Project line-item editor. Nothing
   is saved automatically — the user reviews, edits, and saves.
   Tuned to the Gralessando (S) Pte Ltd quotation template:
   Ref No. / COMPANY / DATE headers, numbered item rows with
   qty + description + unit/total price, P/N lines, ATB/BTP
   section headers, goodwill discount, optional DAP charge and
   final total, currency / warranty / validity sections.
   ============================================================ */
var PDFJS_URL="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
var PDFJS_WORKER="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function loadPdfJs(){
  return new Promise(function(resolve,reject){
    if(window.pdfjsLib){resolve();return;}
    var s=document.createElement("script");
    s.src=PDFJS_URL;
    s.onload=function(){
      try{window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;}catch(e){}
      resolve();
    };
    s.onerror=function(){reject(new Error("could not load the PDF reader (check your internet connection)"));};
    document.head.appendChild(s);
  });
}

/* Extract text lines from a PDF File: group text items by y position,
   sort left-to-right, join. Good enough for regex parsing. */
async function pdfFileToLines(file){
  await loadPdfJs();
  var buf=await file.arrayBuffer();
  var doc=await window.pdfjsLib.getDocument({data:buf}).promise;
  var lines=[];
  for(var p=1;p<=doc.numPages;p++){
    var page=await doc.getPage(p);
    var tc=await page.getTextContent();
    var rows=[];
    tc.items.forEach(function(it){
      if(!it.str||!it.str.trim())return;
      var y=it.transform[5],x=it.transform[4];
      var row=rows.find(function(r){return Math.abs(r.y-y)<3;});
      if(!row){row={y:y,items:[]};rows.push(row);}
      row.items.push({x:x,str:it.str});
    });
    rows.sort(function(a,b){return b.y-a.y;});
    rows.forEach(function(r){
      r.items.sort(function(a,b){return a.x-b.x;});
      lines.push(r.items.map(function(i){return i.str;}).join(" ").replace(/\s+/g," ").trim());
    });
  }
  return lines;
}

function qpNum(s){return parseFloat(String(s).replace(/,/g,""));}
function qpIsPrinterDesc(desc){
  return /\b(TK\s?\d|KPM\s?\d|VKP\s?80|TG\s?24|K80|KX80)/i.test(desc)&&!/TPH/i.test(desc);
}
/* Best existing customer whose name appears inside the COMPANY string */
function qpGuessCustomer(company){
  var names=[];
  TX.forEach(function(t){if(t.customer&&names.indexOf(t.customer)===-1)names.push(t.customer);});
  PROJECTS.forEach(function(p){if(p.customer&&names.indexOf(p.customer)===-1)names.push(p.customer);});
  var best="";
  names.forEach(function(n){
    if(company.toLowerCase().indexOf(n.toLowerCase())!==-1&&n.length>best.length)best=n;
  });
  return best||company;
}
var QP_COUNTRIES=["Philippines","Singapore","Indonesia","China","Australia","Malaysia","Thailand","Vietnam","India","Japan","South Korea","USA","UK","Germany","France","UAE","New Zealand"];

function parseQuotation(lines){
  var q={ref:"",company:"",customer:"",country:"",date:"",currency:"",warranty:"",terms:"",project:"",items:[],totalOverride:null,notes:[]};
  var section="",sectionTag="";
  var lastItem=null,finalTotal=null,sawDap=false,sawExw=false;
  var inCustomerAddress=false; /* country must come from the buyer's address, not the letterhead */

  lines.forEach(function(line){
    var m;
    if((m=line.match(/^Ref\s*No\.?\s*:\s*(.+)$/i))){q.ref=m[1].trim();return;}
    if((m=line.match(/^COMPANY\s*:\s*(.+)$/i))){q.company=m[1].trim();inCustomerAddress=true;return;}
    if(/^(ATTENTION|DATE)\s*:/i.test(line))inCustomerAddress=false;
    if((m=line.match(/^DATE\s*:\s*(.+)$/i))){
      var d=new Date(m[1].trim());
      q.date=isNaN(d)?m[1].trim():d.getDate()+" "+["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]+" "+d.getFullYear();
      return;
    }
    if((m=line.match(/^PRODUCTS\s*:\s*(.+)$/i))){q.notes.push("Products: "+m[1].trim());return;}
    if(inCustomerAddress&&!q.country){
      for(var c=0;c<QP_COUNTRIES.length;c++){
        if(new RegExp("\\b"+QP_COUNTRIES[c]+"\\b","i").test(line)){q.country=QP_COUNTRIES[c];break;}
      }
    }
    /* section headers like "Printer ATB & Accessories :" */
    if(/^[A-Za-z][A-Za-z\s&]+:$/.test(line)&&!/^(Pricing|Delivery|Currency|Payment|Warranty|Validity|Service)/i.test(line)){
      section=line.replace(/\s*:$/,"");
      sectionTag=/\bATB\b/i.test(section)?"ATB":(/\bBTP\b/i.test(section)?"BTP":"");
      return;
    }
    /* numbered item row: "1 22 TK180 Metal ARINC (5 years warranty) $ 1,280.00 $ 28,160.00" */
    if((m=line.match(/^(\d{1,3})\s+(\d[\d,]*)\s+(.+?)\s+\$?\s*([\d,]+(?:\.\d+)?)\s+\$?\s*([\d,]+(?:\.\d+)?)\s*$/))){
      var desc=m[3].trim();
      var wm=desc.match(/\((\d+)\s*years?\s*warranty\)/i);
      if(wm&&!q.warranty)q.warranty=wm[1]+"Y";
      desc=desc.replace(/\s*\(\d+\s*years?\s*warranty\)/i,"").trim();
      var isPrinter=qpIsPrinterDesc(desc);
      if(isPrinter&&sectionTag)desc+=" ("+sectionTag+")";
      lastItem={type:isPrinter?"printer":"other",name:desc,pn:"",qty:qpNum(m[2]),unitPrice:qpNum(m[4])};
      q.items.push(lastItem);
      return;
    }
    if((m=line.match(/^P\/N\s*:?[,\s]*(.+)$/i))){
      if(lastItem&&!lastItem.pn)lastItem.pn=m[1].trim();
      return;
    }
    /* discount: "Goodwill discount : $ (2,100.00)" */
    if((m=line.match(/discount\s*:\s*\$?\s*\(?\s*([\d,]+(?:\.\d+)?)\s*\)?/i))&&!/after/i.test(line)){
      q.items.push({type:"discount",name:line.split(":")[0].trim(),pn:"",qty:1,unitPrice:-qpNum(m[1])});
      return;
    }
    /* DAP charge: "DAP to Bohol Airport : $ 3,240.00" */
    if((m=line.match(/^DAP to (.+?)\s*:\s*\$?\s*([\d,]+(?:\.\d+)?)\s*$/i))){
      sawDap=true;
      if(!q.project)q.project=m[1].trim();
      q.items.push({type:"shipping_adjustment",name:"DAP to "+m[1].trim(),pn:"",qty:1,unitPrice:qpNum(m[2])});
      return;
    }
    /* totals — remember the LAST one as the final quoted total */
    if((m=line.match(/^Total\s.+:\s*\$?\s*([\d,]+(?:\.\d+)?)\s*$/i))){
      finalTotal=qpNum(m[1]);
      if(/\bDAP\b/i.test(line)){
        sawDap=true;
        var pm=line.match(/Total\s+DAP\s*[-–—]\s*(.+?)\s*:/i);
        if(pm&&!q.project)q.project=pm[1].trim();
      }
      if(/Ex-?works?/i.test(line))sawExw=true;
      return;
    }
    if(/Ex-?works?/i.test(line))sawExw=true;
    if(/U\.?S\.?\s*Dollars|USD/i.test(line)&&!q.currency)q.currency="USD";
    if(/Singapore\s*Dollars|SGD/i.test(line)&&!q.currency)q.currency="SGD";
    if(/Rupiah|IDR/i.test(line)&&!q.currency)q.currency="IDR";
    if(/Renminbi|Yuan|RMB/i.test(line)&&!q.currency)q.currency="RMB";
    if(!q.warranty&&(m=line.match(/(\d+)\s*\((?:ONE|TWO|THREE|FOUR|FIVE|TEN)\)\s*YEARS?/i)))q.warranty=m[1]+"Y";
    if((m=line.match(/valid till\s+(.+?)\.?\s*$/i)))q.notes.push("Prices valid till "+m[1].trim());
  });

  q.terms=sawDap?"DAP":(sawExw?"EXW":"");
  q.totalOverride=finalTotal;
  q.customer=q.company?qpGuessCustomer(q.company):"";
  if(q.ref)q.notes.unshift("Quotation Ref: "+q.ref);
  if(q.customer&&q.company&&q.customer!==q.company)q.notes.push("Quoted to: "+q.company);
  return q;
}

/* Button handler in the project modal: parse the first selected PDF
   and pre-fill the form. The file stays selected so it uploads on save. */
async function pjImportFromPdf(){
  var input=document.getElementById("p-pdf");
  var status=document.getElementById("pj-parse-status");
  var say=function(t){if(status)status.textContent=t;};
  if(!input||!input.files||!input.files[0]){
    alert("First choose the quotation PDF in the \"PDF documents\" field above, then click Fill again.");
    return;
  }
  var hasData=pjReadRows().some(function(r){return r.name;});
  if(hasData&&!confirm("Replace the current line items with the ones parsed from the PDF?"))return;
  try{
    say("Reading PDF…");
    var lines=await pdfFileToLines(input.files[0]);
    var q=parseQuotation(lines);
    if(!q.items.length){say("");alert("No line items found — this PDF doesn't match the known quotation layout. Fill the form manually.");return;}
    var set=function(id,v){if(v)document.getElementById(id).value=v;};
    set("p-customer",q.customer);
    set("p-country",q.country);
    set("p-date",q.date);
    set("p-project",q.project);
    set("p-currency",q.currency);
    set("p-terms",q.terms);
    set("p-warranty",q.warranty);
    /* Only default the status to Quotation for a brand-new entry; when
       overriding an existing one keep whatever status it already has
       (e.g. a confirmed PO shouldn't silently revert to Quotation). */
    if(!PJ_EDIT_ID)document.getElementById("p-status").value="Quotation";
    if(q.totalOverride)document.getElementById("p-override").value=q.totalOverride;
    if(q.notes.length)document.getElementById("p-notes").value=q.notes.join("\n");
    document.getElementById("pj-rows").innerHTML="";
    q.items.forEach(function(li){
      /* auto-fill buying price for margin when the PN or name is known */
      var match=findBuyingMatch(li.name,li.pn);
      pjAddRow({type:li.type,name:li.name,pn:li.pn,qty:li.qty,unitPrice:li.unitPrice,buyingPrice:(match&&li.type==="printer"&&match.currency==="USD")?match.price:""});
    });
    pjRecalc();
    say("Filled from "+(q.ref||input.files[0].name)+" — "+q.items.length+" line items. Review, then Save.");
  }catch(err){
    console.error(err);
    say("");
    alert("Could not parse the PDF: "+err.message);
  }
}
