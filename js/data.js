let BUYING=[
  {model:"Cutter Ejector Module KPM180H CN",pn:"976AH010000003",price:94.53,currency:"USD",group:"KPM180 Spare Parts"},
  {model:"PCBA CPU KPM180 E12 R2 ST101_DP007 VN UL",pn:"8120000000000961",price:70.08,currency:"USD",group:"KPM180 Spare Parts"},
  {model:"Autocutter KPM180H 85MM Kyoujin",pn:"9B2GR020000011",price:33.60,currency:"USD",group:"KPM180 Spare Parts"},
  {model:"TK180 TPH",pn:"43000000045700",price:23.88,currency:"USD"},
  {model:"KPM180 TPH",pn:"43000000045700",price:23.88,currency:"USD"},
  {model:"K80",pn:"915LC010137300",price:58.25,currency:"USD"},
  {model:"TG2480HIII",pn:"915CH030100300",price:112.00,currency:"USD"},
  {model:"VKP80III Rear Connector",pn:"915DX011700300",price:149.00,currency:"USD",specialPrice:135.60,specialCustomer:"Nanshan"},
  {model:"KX80S ETH USB RS232",pn:"915PF020100700",price:81.00,currency:"USD",specialPrice:81.00,specialCustomer:"Cui Zong"},
  {model:"TG2460HIII Standard Version",pn:"915CG040200300 or 915CG060100300",price:119.00,currency:"USD"},
  {model:"VKP80II-RX",pn:"915DW011200300",price:189.00,currency:"USD"},
  {model:"VKP80II Paper Roll Holder",pn:"974DW010000001",price:10.00,currency:"USD"},
  {model:"Roll Holder Kit for TK180 Metal",pn:"974HL010000009",price:46.35,currency:"USD"},
  {model:"New Metal Roll Holder for Bag Tag and GPP Paper (TK180 Plastic)",pn:"974HL020000004",price:46.80,currency:"USD"},
  {model:"TK180 Plastic AEA",pn:"911HL020900733",price:287.59,currency:"USD"},
  {model:"TK180 Metal Cutter NON AEA",pn:"911HL011200733",price:369,currency:"USD"},
  {model:"TK180 Metal Cutter AEA",pn:"911HL011300733",price:394,currency:"USD"},
  {model:"KPM180 NON AEA (China)",pn:"915AH020300700",price:260,currency:"USD"},
  {model:"KPM180 NON AEA (Outside China)",pn:"915AH020300700",price:275,currency:"USD"},
  {model:"KPM180H-LL",pn:"915AH030100700",price:360,currency:"USD"},
  {model:"TK202 Plastic",pn:"911BD050300313",price:445,currency:"USD"},
];
let OTHERS=[
  {date:"Sep\u2013Oct 2025",desc:"Service for Philippines",value:"$126,391.32 USD",sub:"360 printers \xb7 Breakdown: $51,378.60 (2 Sep 2025) + $75,012.72 (15 Oct 2025)"},
  {date:"18 Nov 2025",desc:"Service for Vietnam",value:"$15,364.92 USD",sub:""},
  {date:"",desc:"Arinc \u2014 Std TK180 TPH",value:"$108.80 USD EXW",sub:""},
  {date:"",desc:"Aboitiz Bohol \u2014 order summary",value:"$88,314.40 USD",sub:"EXW total $88,074.40 \u2192 Goodwill discount \u22123,000 \u2192 After discount $85,074.40 \u2192 DAP Bohol +$3,240 \u2192 Final $88,314.40"},
  {date:"",desc:"DAP \u2014 Delivered At Place",value:"Shipping term",sub:"Seller delivers to named destination. Buyer pays import duties & taxes. Aboitiz Bohol: transit via Manila/Cebu \u2014 Aboitiz InfraCapital clears customs and pays all duties & taxes."},
  {date:"",desc:"DDP \u2014 Delivered Duty Paid",value:"Shipping term",sub:"Seller bears all costs to destination including duties & customs clearance. Maximum obligation for seller."},
  {date:"",desc:"EXW \u2014 Ex Works",value:"Shipping term",sub:"Seller makes goods available at their premises. Buyer bears all transport costs, export & import clearance. Minimum obligation for seller."},
  {date:"",desc:"CIF \u2014 Cost, Insurance & Freight",value:"Shipping term",sub:"Seller pays freight & insurance to destination port. Risk transfers to buyer once goods are loaded on vessel."},
  {date:"",desc:"FOB \u2014 Free On Board",value:"Shipping term",sub:"Seller delivers on board vessel at origin port. Risk & cost transfer to buyer from that point."},
  {date:"",desc:"CIP \u2014 Carriage & Insurance Paid To",value:"Shipping term",sub:"Seller pays freight & insurance to named destination. Risk transfers when goods handed to first carrier."},
  {date:"",desc:"CPT \u2014 Carriage Paid To",value:"Shipping term",sub:"Seller pays freight only (no insurance) to named destination. Risk transfers at first carrier handover."},
];
let TX=[
  {customer:"Philippines Airlines",country:"Philippines",date:"6 May 2024",status:"PO",project:"Worldwide Philippines",pn:"911HL011200733",model:"TK180 Metal Cutter",qty:"234 units",price:988,currency:"USD",terms:["DDP"],warranty:"5Y",bp:369,notes:[]},
  {customer:"SITA",country:"Philippines",date:"13 Apr 2026",status:"Quotation",project:"Philippines T4 & T5",pn:"911HL020600733",model:"TK180 Plastic",qty:"23 (T4) + 74 (T5) units",price:838,currency:"USD",terms:["DDP"],warranty:"5Y",bp:287.59,notes:["T4: 23 units, T5: 74 units \u2014 same pricing structure"]},
  {customer:"SITA",country:"Philippines",date:"4 Sep 2024",status:"Lose",project:"Philippines San Miguel T1,2,3",pn:"911HL020600733",model:"TK180 Plastic",qty:"640 units",price:768,currency:"USD",terms:["DDP"],warranty:"5Y",bp:287.59,notes:["Lost quotation"]},
  {customer:"SITA",country:"Philippines",date:"10 Jan 2022",status:"PO",project:"Philippines T1",pn:"911HL020600733",model:"TK180 Plastic",qty:"103 units",price:688,currency:"USD",terms:[],warranty:"",bp:287.59,notes:["Warranty conditions unclear"]},
  {customer:"SITA",country:"Philippines",date:"24 Jul 2019",status:"PO",project:"Philippines Airport",pn:"911HL020600733",model:"TK180 Plastic",qty:"451 units",price:468.19,currency:"USD",terms:[],warranty:"3Y",bp:287.59,notes:["Manual DDP calc = $551.80/unit","Total DDP $37,680"]},
  {customer:"Singapore Airlines",country:"Singapore",date:"31 Jul 2025",status:"PO",project:"Changi Airport",pn:"911HL020900733",model:"TK180 Plastic",qty:"120 units",price:1090,currency:"SGD",terms:[],warranty:"5Y",bp:null,totalOverride:228396,notes:["$808 printer+1Y, +$282 top-up to 5Y","Roll holder (974HL020000004): $108 SGD × 57 units = $6,156","On-site install $42/unit × 120 = $5,040","Maintenance + consumables $240/unit/yr × 120 × 3 yrs = $86,400"]},
  {customer:"Singapore Airlines",country:"Singapore",date:"17 Oct 2025",status:"PO",project:"Changi Airport",pn:"911BB100400733",model:"TK302 Metal Triple Feeder",qty:"15 units",price:4256,currency:"SGD",terms:[],warranty:"5Y",bp:null,totalOverride:76440,notes:["$3,128 printer+1Y, +$1,128 top-up to 5Y","Vertical Tray TK302 Metal Case (974BB060000003): $78/unit × 15 = $1,170","On-site install $42/unit × 15 = $630","Maintenance + consumables $240/unit/yr × 15 × 3 yrs = $10,800"]},
  {customer:"Singapore Cruise Center",country:"Singapore",date:"31 Mar 2026",status:"PO",project:"Harborfront Cruise",pn:"911HL011200733",model:"TK180 Metal Cutter",qty:"6 units",price:2318,currency:"SGD",terms:[],warranty:"5Y",bp:null,totalOverride:15188,notes:["Roll Holder (974HL010000009): $128 SGD × 10 = $1,280"]},
  {customer:"Daifuku",country:"Australia",date:"2025-01-01",displayDate:"2025\u20132026",status:"Quotation",project:"Gold Coast",pn:"",model:"TK180 Plastic",qty:"TBD",price:608,currency:"USD",terms:[],warranty:"1Y",bp:287.59,notes:["Tiered warranty pricing:","$608 \u2014 1Y","$658 \u2014 2Y","$698 \u2014 3Y","$768 \u2014 4Y","$828 \u2014 5Y","Roll holder $78 USD"]},
  {customer:"Daifuku",country:"Australia",date:"2024-01-01",displayDate:"Recurring",status:"PO",project:"Multiple orders (ongoing)",pn:"",model:"KPM180 Cutter NON AEA",qty:"Multiple",price:568,currency:"USD",terms:[],warranty:"1Y",bp:275,notes:["Recurring PO customer \u2014 multiple purchases over time"]},
  {customer:"Aboitiz",country:"Philippines",date:"18 Feb 2026",status:"PO",project:"Cebu",pn:"911HL010400733",model:"TK180 Metal Non Cutter",qty:"42 units",price:980,currency:"USD",terms:["EXW"],warranty:"3Y",bp:null,totalOverride:43218,notes:["Roll Holder (974HL010000009): $98 × 21 units = $2,058"]},
  {customer:"Aboitiz",country:"Philippines",date:"Apr 2026",status:"Quotation",project:"Bohol Airport",projectGroup:"Bohol Airport",pn:"Cutter (911HL011400733 + ARTFITT415) | Non Cutter (911HL010300733 + ARTFITT415)",model:"TK180 Metal Cutter ARINC (ATB) + TK180 Metal Non Cutter ARINC (BTP)",displayModel:"TK180 Metal Cutter ARINC",qty:"30 units (ATB) + 24 units (BTP)",price:1680,dualPrice:1280,currency:"USD",terms:["DAP"],warranty:"5Y",bp:null,printerTotalOverride:81120,totalOverride:88314.40,notes:["Ticket Tray Metal (976HL010000007): $98 × 30 = $2,940","Roll Holder (974HL010000003): $98 × 24 = $2,352","1.8M USB Cable (2650000000003566): $10.80 × 54 = $583.20","USA Plug Power Cable (2610000000031): $17.80 × 54 = $961.20","TK180 TPH (43000000045700): $118 × 1 = $118","Goodwill discount: −$3,000 | DAP: +$3,240","EXW $88,074.40 → after discount $85,074.40 → Total DAP $88,314.40"]},
  {customer:"Aboitiz",country:"Philippines",date:"Apr 2026",status:"Quotation",project:"Bohol Airport — ATB",pn:"911HL011400733 + ARTFITT415",model:"TK180 Metal Cutter ARINC",qty:"30 units",price:1680,currency:"USD",terms:["DAP"],warranty:"5Y",bp:null,projectGroup:"Bohol Airport",notes:["See Bohol Airport combined entry for full project details"]},
  {customer:"Aboitiz",country:"Philippines",date:"Apr 2026",status:"Quotation",project:"Bohol Airport — BTP",pn:"911HL010300733 + ARTFITT415",model:"TK180 Metal Non Cutter ARINC",qty:"24 units",price:1280,currency:"USD",terms:["DAP"],warranty:"5Y",bp:null,projectGroup:"Bohol Airport",notes:["See Bohol Airport combined entry for full project details"]},
  {customer:"Aboitiz",country:"Philippines",date:"Apr 2026",status:"Quotation",project:"Laguindingan Airport — ATB",pn:"911HL011400733 + ARTFITT415",model:"TK180 Metal Cutter ARINC",qty:"21 units",price:1680,currency:"USD",terms:["DAP"],warranty:"5Y",bp:null,projectGroup:"Laguindingan Airport",notes:["See Laguindingan Airport combined entry for full project details"]},
  {customer:"Aboitiz",country:"Philippines",date:"Apr 2026",status:"Quotation",project:"Laguindingan Airport — BTP",pn:"911HL010300733 + ARTFITT415",model:"TK180 Metal Non Cutter ARINC",qty:"18 units",price:1280,currency:"USD",terms:["DAP"],warranty:"5Y",bp:null,projectGroup:"Laguindingan Airport",notes:["See Laguindingan Airport combined entry for full project details"]},
  {customer:"Aboitiz",country:"Philippines",date:"Apr 2026",status:"Quotation",project:"Laguindingan Airport",projectGroup:"Laguindingan Airport",pn:"Cutter (911HL011400733 + ARTFITT415) | Non Cutter (911HL010300733 + ARTFITT415)",model:"TK180 Metal Cutter ARINC (ATB) + TK180 Metal Non Cutter ARINC (BTP)",displayModel:"TK180 Metal Cutter ARINC",qty:"21 units (ATB) + 18 units (BTP)",price:1680,dualPrice:1280,currency:"USD",terms:["DAP"],warranty:"5Y",bp:null,printerTotalOverride:58320,totalOverride:63481.40,notes:["Ticket Tray Metal (976HL010000007): $98 × 21 = $2,058","Roll Holder (974HL010000003): $98 × 18 = $1,764","1.8M USB Cable (2650000000003566): $10.80 × 39 = $421.20","USA Plug Power Cable (2610000000031): $17.80 × 39 = $694.20","TK180 TPH (43000000045700): $118 × 1 = $118","Goodwill discount: −$2,000 | DAP: +$2,106","EXW $63,375.40 → after discount $61,375.40 → Total DAP $63,481.40"]},
  {customer:"SITA",country:"Indonesia",date:"17 Apr 2026",status:"PO",project:"DPS (Bali)",pn:"911HL020600733",model:"TK180 Plastic",qty:"22 units",price:9000000,currency:"IDR",terms:["DDP"],warranty:"5Y",bp:null,totalOverride:204380000,notes:["11 ATB, 11 BTP (with paper roll)","Paper roll (580,000 IDR × 11 units) = 6,380,000 IDR","USD/IDR rate: USD 1.00 = IDR 16,750.00 +/- 2%. If actual rate moves outside +/-2% band, price to be adjusted accordingly."]},
  {customer:"SITA",country:"Indonesia",date:"17 Apr 2026",status:"PO",project:"SUB (Surabaya)",pn:"911HL020600733",model:"TK180 Plastic",qty:"9 units",price:9000000,currency:"IDR",terms:["DDP"],warranty:"5Y",bp:null,totalOverride:83320000,notes:["5 ATB, 4 BTP (with paper roll)","Paper roll (580,000 IDR × 4 units) = 2,320,000 IDR","USD/IDR rate: USD 1.00 = IDR 16,750.00 +/- 2%. If actual rate moves outside +/-2% band, price to be adjusted accordingly."]},
  {customer:"Philippines Airlines",country:"Philippines",date:"17 Apr 2026",status:"PO",project:"Worldwide Philippines",pn:"43000000045700",model:"TK180 TPH",qty:"—",price:118,currency:"USD",terms:["DDP"],warranty:"1Y",bp:null,noPrinterTotal:true,notes:["Thermal Print Head (consumable/spare part) for TK180"]},
  {customer:"Arinc",country:"Philippines",date:"",status:"Quotation",project:"Philippines",pn:"43000000045700",model:"TK180 TPH",qty:"—",price:108.8,currency:"USD",terms:["EXW"],warranty:"1Y",bp:null,noPrinterTotal:true,notes:["Thermal Print Head (consumable/spare part) for TK180"]},
  {customer:"SITA",country:"Indonesia",date:"3 Feb 2026",status:"PO",project:"DPS (Bali)",pn:"43000000045700",model:"TK180 TPH",qty:"50 units",price:1788000,currency:"IDR",terms:["DDP"],warranty:"1Y",bp:null,totalOverride:90200000,noPrinterTotal:true,notes:["Thermal Print Head (consumable/spare part) for TK180","Delivery: 800,000 IDR"]},
  {customer:"WZ",country:"China",date:"",status:"Quotation",project:"WZ Standard Pricing",pn:"",model:"KPM180 with AEA",qty:"TBD",price:5100,currency:"RMB",terms:[],warranty:"1Y",bp:null,notes:["Standard selling prices for WZ"]},


  {customer:"WZ",country:"China",date:"",status:"Quotation",project:"WZ Standard Pricing",pn:"",model:"TK180 Metal Cutter",qty:"TBD",price:5280,currency:"RMB",terms:[],warranty:"1Y",bp:null,notes:[]},


  {customer:"WZ",country:"China",date:"",status:"Quotation",project:"WZ Standard Pricing",pn:"",model:"TK202 with AEA",qty:"TBD",price:5800,currency:"RMB",terms:[],warranty:"1Y",bp:null,notes:[]},
];

// Seed snapshots — used by reseedDB()
var TX_SEED=TX.map(function(t){return Object.assign({},t);});
var BUYING_SEED=BUYING.map(function(b){return Object.assign({},b);});
var OTHERS_SEED=OTHERS.map(function(o){return Object.assign({},o);});
var SPARES_SEED=[];
var MODELS_SEED=[];

// NEW (Stage 2): Projects + line items from new tables
let PROJECTS=[];
let LINE_ITEMS=[];
