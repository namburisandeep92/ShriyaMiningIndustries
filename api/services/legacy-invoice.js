export const headerDefaults = {
  'Invoice no': '', 'Invoice date': '', 'Buyer PO nos': '', 'Buyer PO date': '', 'Other reference': '',
  Exporter: 'SHRIYA MINING INDUSTRIES\nS.NO: 1174/2B, ONGOLE ROAD\nMARKAPUR - 523 316\nPRAKASAM D.T. (A.P) INDIA.',
  Consignee: 'NATURAL STONE RESOURCES INC\nU.S.A.', 'Buyer (if other)': '',
  'Notify party': 'NATURAL STONE RESOURCES\nUSA', 'Country of origin': 'INDIA', 'Final destination': 'U.S.A',
  'Pre-carriage by': 'BY ROAD', 'Place of receipt': 'CHENNAI', 'Vessel / Flight': 'BY SEA',
  'Port of loading': 'CHENNAI', 'Port of discharge': 'HOUSTON', 'Final delivery': 'HOUSTON',
  'Payment terms': 'D.P AT SIGHT', 'Marks code': 'CODE ; DAL', 'Container no': '',
  Packing: 'WOODEN CRATES', Grade: 'FIRST GRADE', 'Crate starting no': '',
};

export const headerGroups = [
  { title: 'Invoice details', fields: ['Invoice no', 'Invoice date', 'Buyer PO nos', 'Buyer PO date', 'Other reference'] },
  { title: 'Parties', fields: ['Exporter', 'Consignee', 'Buyer (if other)', 'Notify party'] },
  { title: 'Shipping', fields: ['Country of origin', 'Final destination', 'Pre-carriage by', 'Place of receipt', 'Vessel / Flight', 'Port of loading', 'Port of discharge', 'Final delivery'] },
  { title: 'Terms & packing', fields: ['Payment terms', 'Marks code', 'Container no', 'Packing', 'Grade', 'Crate starting no'] },
];

export function lineAmount(line) {
  const quantity = Number(line.qty || 0), rate = Number(line.rate || 0);
  if (Number.isSafeInteger(quantity) && quantity > 0 && Number.isFinite(rate) && rate > 0 && rate < 1e13) {
    // Match SQL decimal arithmetic instead of rounding a binary float such as 7 * 1.005.
    const millionths = BigInt(rate.toFixed(6).replace('.', ''));
    return Number((BigInt(quantity) * millionths + 5000n) / 10000n) / 100;
  }
  return Math.round(quantity * rate * 100) / 100;
}
export const invoiceTotal = lines => Math.round(lines.reduce((sum, line) => sum + lineAmount(line), 0) * 100) / 100;
const numeric = value => typeof value === 'number' || typeof value === 'string';
const positiveInteger = value => numeric(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
const positiveNumber = value => numeric(value) && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;
const esc = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function crateRanges(lines, startingNumber) {
  let next = Number(startingNumber);
  return lines.map(line => {
    const count = Number(line?.crates);
    const range = positiveInteger(startingNumber) && positiveInteger(count)
      ? count === 1 ? String(next) : `${next} - ${next + count - 1}` : '';
    next += positiveInteger(count) ? count : 0;
    return range;
  });
}

export function validateLegacyInvoice(document) {
  const errors = [];
  if (!document || typeof document !== 'object' || !document.header || !Array.isArray(document.lines)) {
    return [{ field: 'document', message: 'Invoice details and lines are required' }];
  }
  const header = document.header;
  for (const key of Object.keys(headerDefaults)) {
    if (typeof header[key] !== 'string') errors.push({ field: key, message: `${key} must be text` });
  }
  if (!String(header['Invoice no'] || '').trim()) errors.push({ field: 'Invoice no', message: 'Invoice no is required' });
  if (String(header['Invoice no'] || '').length > 20) errors.push({ field: 'Invoice no', message: 'Invoice no must not exceed 20 characters' });
  if (!validDate(header['Invoice date'] || '')) errors.push({ field: 'Invoice date', message: 'Invoice date must be a valid date' });
  if (header['Buyer PO date'] && !validDate(header['Buyer PO date'])) errors.push({ field: 'Buyer PO date', message: 'Buyer PO date must be a valid date' });
  if (!positiveInteger(header['Crate starting no'])) errors.push({ field: 'Crate starting no', message: 'Crate start # must be a positive integer' });
  if (!document.lines.length || document.lines.length > 1000) errors.push({ field: 'lines', message: 'Between 1 and 1000 lines are required' });
  const ranges = crateRanges(document.lines, header['Crate starting no']);
  document.lines.forEach((line, index) => {
    const add = (field, message) => errors.push({ line: index, field, message: `Line ${index + 1}: ${message}` });
    if (!line || typeof line !== 'object') { add('line', 'Invalid line'); return; }
    for (const field of ['stone', 'finish', 'size', 'ref', 'uom', 'kind', 'crt']) {
      if (typeof line[field] !== 'string') add(field, `${field} must be text`);
    }
    if (!positiveInteger(line.qty)) add('qty', 'Qty must be a positive integer');
    if (Number(line.qty) >= 1e15) add('qty', 'Qty is too large');
    if (!positiveInteger(line.crates)) add('crates', 'Crate count must be a positive integer');
    if (!line.crt || line.crt !== ranges[index]) add('crt', 'Crate range must match crate start and count');
    if (!String(line.uom || '').trim()) add('uom', 'UOM is required');
    if (String(line.uom || '').length > 10) add('uom', 'UOM must not exceed 10 characters');
    if (line.net !== '' && !positiveNumber(line.net)) add('net', 'Weight must be a positive number or blank');
    if (!positiveNumber(line.rate)) add('rate', 'Rate per UOM must be a positive number');
    if (Number(line.rate) >= 1e13 || (Number.isFinite(Number(line.rate))
        && Math.abs(Number(line.rate) - Number(Number(line.rate).toFixed(6))) > 1e-10)) {
      add('rate', 'Rate must be below 10 trillion and have at most 6 decimal places');
    }
    if (!Number.isFinite(lineAmount(line)) || lineAmount(line) >= 1e15) add('rate', 'Line amount is too large');
  });
  const total = invoiceTotal(document.lines.filter(line => line && typeof line === 'object'));
  if (!Number.isFinite(total) || total >= 1e15) errors.push({ field: 'lines', message: 'Invoice total is too large' });
  return errors;
}

export function createLegacyInvoice(rows, previousLines = [], previousHeader = {}) {
  const previous = new Map(previousLines.filter(line => line.src).map(line => [line.src, line]));
  const lines = rows.map(row => {
    const parsed = parseItem({ item: row.item });
    return { stone: parsed.stone, finish: parsed.finish, size: parsed.size,
      ref: `NSR PO # ${row.po}${row.so ? ` // SO # ${row.so}` : ''} (${row.sku})`,
      crates: '', crt: '', qty: row.qty, uom: row.uom, net: '', gross: '',
      rate: row.uom === 'SF' ? ({ '12" X 12"': 1.62, '12" X 24"': 1.75 }[parsed.size] || 0) : 0,
      code: parsed.code, kind: parsed.kind, src: row.key, poQty: row.qty, poUom: row.uom,
      ...previous.get(row.key),
    };
  }).sort((a, b) => a.kind.localeCompare(b.kind));
  const dates = rows.map(row => new Date(row.date)).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => a - b);
  const header = { ...headerDefaults, 'Invoice date': new Date().toISOString().slice(0, 10),
    'Buyer PO nos': [...new Set(rows.map(row => row.po))].join(', '),
    'Buyer PO date': dates.length ? dates[0].toISOString().slice(0, 10) : '',
    'Marks code': `CODE ; ${[...new Set(rows.map(row => parseItem({ item: row.item }).code).filter(Boolean))].join(', ')}`,
    'Crate starting no': previousHeader['Crate starting no'] || '',
  };
  crateRanges(lines, header['Crate starting no']).forEach((range, index) => { lines[index].crt = range; });
  return { header, lines, words: amountWords(invoiceTotal(lines)) };
}

function w(n){const a='ZERO ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN ELEVEN TWELVE THIRTEEN FOURTEEN FIFTEEN SIXTEEN SEVENTEEN EIGHTEEN NINETEEN'.split(' '),b='_ _ TWENTY THIRTY FORTY FIFTY SIXTY SEVENTY EIGHTY NINETY'.split(' ');
 if(n<20)return a[n];if(n<100)return b[n/10|0]+(n%10?' '+a[n%10]:'');if(n<1000)return a[n/100|0]+' HUNDRED'+(n%100?' '+w(n%100):'');
 if(n<1e6)return w(n/1000|0)+' THOUSAND'+(n%1000?' '+w(n%1000):'');return w(Math.floor(n/1e6))+' MILLION'+(n%1e6?' '+w(n%1e6):'')}
export function amountWords(t){const d=Math.floor(t),c=Math.round((t-d)*100);return`USD ${w(d)} AND CENTS ${w(c)} ONLY`}

export function parseItem(r){let s=r.item,code='';const m0=s.match(/^([A-Z]{2,4}) - /);if(m0){code=m0[1];s=s.slice(m0[0].length)}
 const N='(?:\\d+ \\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)';const m=s.match(new RegExp('('+N+')\\s?x\\s?('+N+')','i'));const ev=t=>t.split(' ').reduce((q,u)=>q+(u.includes('/')?u.split('/')[0]/u.split('/')[1]:+u),0);let stone=s,finish='',size='',area=0;
 if(m){stone=s.slice(0,m.index).trim();size=`${m[1]}" X ${m[2]}"`;area=ev(m[1])*ev(m[2])/144;finish=(s.slice(m.index+m[0].length).trim().split(' ')[0]||'')}
 else{const w=s.split(' ');finish=w.slice(-3,-2)[0]||''}
 const kind=/granite/i.test(s)?'GRANITE TILES':/slate/i.test(s)?'SLATE STONE TILES':/lime/i.test(s)?'LIMESTONE':'';
 return{code,stone:stone.toUpperCase(),finish:finish.toUpperCase(),size,area,kind}}

export async function buildLegacyWorkbook(document){
const {default:ExcelJS}=await import('exceljs');
const H=document.header,L=document.lines,amt=lineAmount,total=()=>invoiceTotal(L);
const WD=document.words||amountWords(total());const h=k=>H[k]||'';const lines=L.map(l=>({...l,amount:amt(l)}));
const un=u=>String(u||'').replace(/[^A-Za-z0-9 ]/g,'').toUpperCase();
const qd=l=>({v:+l.qty||0,nf:(Number.isInteger(+l.qty)?'#,##0':'#,##0.00')+' "'+(un(l.uom)||'QTY')+'"'});
const rnf=l=>'0.00"/'+(un(l.uom)||'QTY')+'"';
const tc=lines.reduce((a,l)=>a+(parseInt(l.crates)||0),0),tn=lines.reduce((a,l)=>a+(+l.net||0),0);
const uk=new Set(lines.map(l=>un(l.uom))),uni=lines.length>0&&uk.size==1,tnf=uni?'#,##0.00 "'+(un(lines[0].uom)||'QTY')+'"':'#,##0.00';
const wb=new ExcelJS.Workbook();wb.creator='Shriya Mining Industries';wb.title='Invoice '+h('Invoice no');
const EARTH='FF7A5C3E',EARTH_LT='FFC49A6C',LIGHT='FFEDE6DA',MID='FFF1E5D7',LINE='FFC8BEAD',HAIR='FFE0D8CE',ZEB='FFF7F3EE',GOLD='FFF7E2A8';
const NAVY=EARTH,BLUE=EARTH_LT;
const Ln={style:'thin',color:{argb:LINE}},Hr={style:'hair',color:{argb:LINE}},MED={style:'medium',color:{argb:NAVY}};
const BD={top:Ln,left:Ln,bottom:Ln,right:Ln},VB={left:Ln,right:Ln};
const d=h('Invoice date'),dt=d?new Date(d+'T00:00:00Z'):'',pd=h('Buyer PO date'),ptxt=pd?pd.split('-').reverse().join('-'):'';
function sheet(name,title,inv,tab){
 const ws=wb.addWorksheet(name,{properties:{tabColor:{argb:tab}},views:[{showGridLines:false}],pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,horizontalCentered:true,margins:{left:.4,right:.4,top:.5,bottom:.6,header:.2,footer:.25}}});
 ws.headerFooter={oddFooter:'&L&8Shriya Mining Industries&C&8Page &P of &N&R&8&D'};
 [12,12,14,14,14,14,14,13,16].forEach((w,i)=>ws.getColumn(i+1).width=w);
 const put=(r,c1,c2,v,o={},r2=r)=>{if(c2>c1||r2>r)ws.mergeCells(r,c1,r2,c2);const c=ws.getCell(r,c1);c.value=v;
  c.font={name:'Calibri',size:o.size||10.5,bold:!!o.b,italic:!!o.i,color:{argb:o.color||'FF1B2430'}};
  const hz=o.h||'left';c.alignment={horizontal:hz,vertical:o.v||'middle',wrapText:!!o.wrap,indent:hz=='center'?0:(o.ind??1)};if(o.nf)c.numFmt=o.nf;
  for(let a=r;a<=r2;a++)for(let b=c1;b<=c2;b++){const x=ws.getCell(a,b);x.border=o.bd||BD;if(o.fill)x.fill={type:'pattern',pattern:'solid',fgColor:{argb:o.fill}}}return c};
 const lab=(r,c1,c2,t)=>{put(r,c1,c2,t.toUpperCase(),{size:8,b:1,color:BLUE,fill:LIGHT,bd:{top:Ln,left:Ln,right:Ln}});ws.getRow(r).height=15};
 const val=(r,c1,c2,t,o={},r2=r)=>put(r,c1,c2,t,{bd:{left:Ln,right:Ln,bottom:Ln},...o},r2);
 const block=(r,c1,c2,arr,n)=>{for(let k=0;k<n;k++){put(r+k,c1,c2,arr[k]||'',{b:k==0,size:k?10.5:12,color:k?undefined:NAVY,bd:{left:Ln,right:Ln,bottom:k==n-1?Ln:undefined}});ws.getRow(r+k).height=18}};
 put(1,1,9,'SHRIYA MINING INDUSTRIES',{b:1,size:20,color:'FFFFFFFF',fill:NAVY,h:'center',bd:{}});ws.getRow(1).height=38;
 put(2,1,9,title,{b:1,size:14,color:NAVY,fill:MID,h:'center',bd:{bottom:Ln}});ws.getRow(2).height=24;
 let r=3;
 lab(r,1,5,'Exporter');lab(r,6,9,'Invoice no & Date');r++;
 block(r,1,5,h('Exporter').split('\n'),4);
 val(r,6,7,h('Invoice no'),{b:1,size:12,color:NAVY});val(r,8,9,dt,{b:1,h:'center',nf:'dd-mmm-yyyy'});ws.getRow(r).height=22;
 lab(r+1,6,9,"Buyer's order no & Date");
 val(r+2,6,7,'PO NO  '+h('Buyer PO nos'),{wrap:1,b:1});val(r+2,8,9,'DATE  '+ptxt,{h:'center'});ws.getRow(r+2).height=30;
 val(r+3,6,9,'Other reference(s):  '+h('Other reference'));
 r+=4;
 lab(r,1,5,'Consignee');lab(r,6,9,'Buyer (if other than consignee)');r++;
 block(r,1,5,h('Consignee').split('\n'),4);
 val(r,6,9,h('Buyer (if other)'));lab(r+1,6,9,'Notify Party');
 const np=h('Notify party').split('\n');val(r+2,6,9,np[0]||'',{b:1,color:NAVY});val(r+3,6,9,np.slice(1).join(', '));
 r+=4;
 lab(r,1,3,'Pre-Carriage by');lab(r,4,5,'Place of Receipt by Pre-carrier');lab(r,6,7,'Country of origin of goods');lab(r,8,9,'Country of final destination');r++;
 [[1,3,'Pre-carriage by'],[4,5,'Place of receipt'],[6,7,'Country of origin'],[8,9,'Final destination']].forEach(([a,b,k])=>val(r,a,b,h(k),{b:1}));ws.getRow(r).height=19;r++;
 lab(r,1,3,'Vessel / Flight No');lab(r,4,5,'Port of loading');lab(r,6,9,'Terms of Payment & Delivery');r++;
 val(r,1,3,h('Vessel / Flight'),{b:1});val(r,4,5,h('Port of loading'),{b:1});val(r,6,9,'PAYMENT :   '+h('Payment terms'),{b:1,color:NAVY,v:'top'},r+2);ws.getRow(r).height=19;r++;
 lab(r,1,3,'Port of Destination');lab(r,4,5,'Final Destination');r++;
 val(r,1,3,h('Port of discharge'),{b:1});val(r,4,5,h('Final delivery'),{b:1});ws.getRow(r).height=19;r++;
 const HD={b:1,h:'center',color:'FFFFFFFF',fill:NAVY,bd:{top:Ln,left:Ln,right:Ln,bottom:Ln}};
 put(r,1,2,"Marks & No's",HD);put(r,3,6,'Description of goods',HD);
 put(r,7,7,'Quantity',HD);put(r,8,8,'Weight',HD);put(r,9,9,'Amount',HD);ws.getRow(r).height=22;r++;
 const SB={h:'center',b:1,size:9.5,color:NAVY,fill:MID,bd:{left:Ln,right:Ln,bottom:Ln}};
 put(r,1,2,'Container',SB);put(r,3,6,[tc?String(tc).padStart(2,'0')+' NOS':'',h('Packing'),h('Grade')].filter(Boolean).join('  ·  '),SB);
 put(r,7,7,'Qty / Unit',SB);put(r,8,8,'Weight',SB);put(r,9,9,'USD',SB);r++;
 put(r,1,2,h('Marks code'),{b:1,color:NAVY,bd:VB});put(r,3,9,'',{bd:VB});ws.getRow(r).height=19;r++;
 const first=r;let lk=null,z=0;const fl=f=>f?{fill:f}:{};
 lines.forEach(l=>{
  if(l.kind&&l.kind!==lk){put(r,1,9,l.kind+(l.kind=='GRANITE TILES'?'     HSN CODE 68022310':''),{b:1,color:BLUE,fill:MID,size:10,bd:{left:Ln,right:Ln,top:Ln}});ws.getRow(r).height=20;r++;lk=l.kind;z=0}
  const f=z++%2?ZEB:undefined,I={bd:VB,...fl(f)},q=qd(l);
  put(r,1,2,l.crt?'CRT NO  '+l.crt:'',{...I,b:1,color:NAVY});put(r,3,5,(l.stone+'  '+l.finish).trim(),{...I,b:1,size:11});put(r,6,6,l.size,{...I,h:'center',b:1});
  put(r,7,7,q.v,{...I,h:'right',nf:q.nf});
  const weightValue = l.net === '' || l.net === null || l.net === undefined ? '' : +l.net;
  if(inv){put(r,8,8,weightValue || '',{...I,h:'right',nf:'#,##0.000'});put(r,9,9,l.amount,{...I,h:'right',b:1,nf:'#,##0.00',color:'FF0B5C45'})}
  else{put(r,8,8,weightValue || '',{...I,h:'right',nf:'#,##0.000'});put(r,9,9,l.amount,{...I,h:'right',nf:'#,##0.00'})}
  ws.getRow(r).height=20;r++;
  const cn=parseInt(l.crates)||0;
  put(r,1,2,cn>0?String(cn).padStart(2,'0')+(cn>1?' CRATES':' CRATE'):'',{...I,size:10,color:NAVY});
  put(r,3,6,l.ref,{...I,wrap:1,size:9,i:1,color:'FF5B6578'});put(r,7,7,'',I);put(r,8,9,'',I);ws.getRow(r).height=26;r++;
  put(r,1,9,'',{bd:{left:Ln,right:Ln,bottom:Hr},...fl(f)});ws.getRow(r).height=5;r++});
 put(r,1,2,'',{bd:VB});put(r,3,6,h('Container no')?'CONT # '+h('Container no'):'',{b:1,color:NAVY,bd:VB});put(r,7,9,'',{bd:VB});ws.getRow(r).height=19;r++;
 put(r,1,9,'',{bd:{left:Ln,right:Ln,bottom:Ln}});ws.getRow(r).height=4;
 const last=r;r++;
 const T={b:1,color:'FFFFFFFF',fill:NAVY,h:'center'};
 if(inv){lab(r,1,6,'Amount chargeable in words');ws.getRow(r).height=15;
  put(r,7,7,uni?{formula:`SUM(G${first}:G${last})`,result:lines.reduce((a,l)=>a+(+l.qty||0),0)}:'',{b:1,h:'right',nf:tnf,fill:LIGHT},r+1);put(r,8,8,'TOTAL (USD)',{...T,size:9},r+1);
  put(r,9,9,{formula:`SUM(I${first}:I${last})`,result:total()},{b:1,h:'right',size:13,color:NAVY,nf:'$#,##0.00',fill:GOLD},r+1);
  put(r+1,1,6,WD,{b:1,i:1,wrap:1,color:NAVY,bd:{left:Ln,right:Ln,bottom:Ln}});ws.getRow(r+1).height=26;r+=2}
 else{put(r,1,6,'TOTAL',{...T,h:'left'});put(r,7,7,uni?{formula:`SUM(G${first}:G${last})`,result:lines.reduce((a,l)=>a+(+l.qty||0),0)}:'',{b:1,h:'right',nf:tnf,fill:LIGHT});
  put(r,8,8,{formula:`SUM(H${first}:H${last})`,result:tn},{b:1,h:'right',nf:'#,##0.000',fill:GOLD});put(r,9,9,{formula:`SUM(I${first}:I${last})`,result:total()},{b:1,h:'right',nf:'$#,##0.00',fill:GOLD});ws.getRow(r).height=24;r++;
  put(r,1,9,'TOTAL WEIGHT :   '+tn.toFixed(3)+' KGS',{b:1,fill:LIGHT});r++}
 lab(r,1,5,'Declaration');lab(r,6,9,'Signature & Date');r++;
 put(r,1,5,'We declare that this Invoice shows the actual price of the goods described and that all particulars are true and correct.',{wrap:1,v:'top',size:9.5,color:'FF5B6578',bd:{left:Ln,right:Ln,bottom:Ln}},r+2);
 put(r,6,9,'For SHRIYA MINING INDUSTRIES',{b:1,h:'center',color:NAVY,bd:{left:Ln,right:Ln}});put(r+1,6,9,'',{bd:{left:Ln,right:Ln}});ws.getRow(r+1).height=34;
 put(r+2,6,9,'Authorised Signatory',{h:'center',size:9.5,color:'FF5B6578',bd:{left:Ln,right:Ln,bottom:Ln,top:Hr}});
 const fin=r+2;
 for(let a=1;a<=fin;a++)for(let b=1;b<=9;b++){const x=ws.getCell(a,b),o=x.border||{};x.border={top:a==1?MED:o.top,bottom:a==fin?MED:o.bottom,left:b==1?MED:o.left,right:b==9?MED:o.right}}
 ws.pageSetup.printArea=`A1:I${fin}`}
sheet('INV','INVOICE',true,NAVY);sheet('PACKING','PACKING LIST',false,'FF2E8B6E');
return wb}

function previewCellValue(value){
 if(value==null)return'';
 if(value instanceof Date)return value.toLocaleDateString();
 if(typeof value=='object'){
  if(value.result!==undefined)return previewCellValue(value.result);
  if(Array.isArray(value.richText))return value.richText.map(x=>x.text||'').join('');
  if(value.text!==undefined)return String(value.text);
  if(value.formula)return'';
  return''
 }
 return String(value)
}
export function excelPreviewHtml(wb,title){
 const sections=wb.worksheets.map(ws=>{
  const merges=ws._merges||{},rows=[];
  const color=value=>{const hex=String(value?.argb||'').replace(/^FF/i,'');return/^[0-9A-F]{6}$/i.test(hex)?'#'+hex:''};
  const styleOf=cell=>{
   const s=cell.style||{},f=s.font||{},a=s.alignment||{},parts=[];
   if(f.name&&/^[\w ,.-]+$/.test(f.name))parts.push(`font-family:${f.name}`);
   if(Number.isFinite(+f.size))parts.push(`font-size:${Math.max(8,+f.size*4/3)}px`);
   if(f.bold)parts.push('font-weight:700');if(f.italic)parts.push('font-style:italic');
   const fc=color(f.color);if(fc)parts.push(`color:${fc}`);
   const bg=color(s.fill?.fgColor);if(bg)parts.push(`background-color:${bg}`);
   if(['left','center','right','justify'].includes(a.horizontal))parts.push(`text-align:${a.horizontal}`);
   if(['top','middle','bottom'].includes(a.vertical))parts.push(`vertical-align:${a.vertical=='middle'?'middle':a.vertical}`);
   if(a.wrapText)parts.push('white-space:pre-wrap');else parts.push('white-space:pre-wrap');
   if(Number.isFinite(+a.indent)&&+a.indent>0)parts.push(`padding-left:${Math.min(32,+a.indent*8)}px`);
   const widths={hair:1,thin:1,medium:2,thick:3,double:3};
   for(const side of ['top','right','bottom','left']){const b=s.border?.[side];if(b){const bc=color(b.color)||'#c8bead';parts.push(`border-${side}:${widths[b.style]||1}px solid ${bc}`)}}
   return parts.join(';')
  };
  for(let r=1;r<=ws.rowCount;r++){
   const row=ws.getRow(r),cells=[];
   for(let c=1;c<=ws.columnCount;c++){
    const cell=row.getCell(c);if(cell.isMerged&&cell.master.address!==cell.address)continue;
    const merge=merges[cell.address]?.model,cs=merge?merge.right-merge.left+1:1,rs=merge?merge.bottom-merge.top+1:1;
    cells.push(`<td${cs>1?` colspan="${cs}"`:''}${rs>1?` rowspan="${rs}"`:''}${styleOf(cell)?` style="${styleOf(cell)}"`:''}>${esc(previewCellValue(cell.value))}</td>`)
   }
   const height=Number.isFinite(+row.height)?` style="height:${Math.max(12,+row.height*4/3)}px"`:'';
   rows.push(`<tr${height}>${cells.join('')}</tr>`)
  }
  const widths=Array.from({length:ws.columnCount},(_,i)=>`<col style="width:${Math.max(48,Math.min(240,(ws.getColumn(i+1).width||12)*7))}px">`).join('');
  return`<section><h2>${esc(ws.name)}</h2><div class="sheet"><table><colgroup>${widths}</colgroup><tbody>${rows.join('')}</tbody></table></div></section>`
 }).join('');
 return`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — Preview</title><style>
 *{box-sizing:border-box}body{margin:0;padding:24px;background:#f7f3ee;color:#2a2520;font:14px/1.35 Calibri,Arial,sans-serif}
 h1{font-size:20px;margin:0 0 18px;color:#7a5c3e}h2{font-size:16px;margin:0 0 8px;color:#7a5c3e}
 section{margin:0 0 24px}.sheet{overflow:auto;max-height:80vh;background:#fffdf9;border:1px solid #c8bead}
 table{border-collapse:collapse;table-layout:fixed;background:#fffdf9}td{padding:3px 5px;overflow-wrap:anywhere;vertical-align:middle}
 @media print{body{padding:0}.sheet{max-height:none;overflow:visible}section{break-after:page}}
 </style></head><body><h1>${esc(title)}</h1>${sections}</body></html>`
}

export function buildLegacyPrintHtml(document,title){
const H=document.header,L=document.lines,amt=lineAmount,total=()=>invoiceTotal(L);
const h=k=>H[k]||'',E=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),ml=v=>E(v).replace(/\n/g,'<br>');
const un=u=>String(u||'').replace(/[^A-Za-z0-9 ]/g,'').toUpperCase()||'QTY',nf=(n,d)=>(+n||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const qf=l=>(Number.isInteger(+l.qty)?nf(l.qty,0):nf(l.qty,2))+' '+un(l.uom);
const tc=L.reduce((a,l)=>a+(parseInt(l.crates)||0),0),tn=L.reduce((a,l)=>a+(+l.net||0),0);
const uk=new Set(L.map(l=>un(l.uom))),uni=L.length>0&&uk.size==1,tq=uni?nf(L.reduce((a,l)=>a+(+l.qty||0),0),2)+' '+[...uk][0]:'';
const d=h('Invoice date'),dd=d?d.split('-').reverse().join('-'):'',pd=h('Buyer PO date'),pdd=pd?pd.split('-').reverse().join('-'):'';
const np=h('Notify party').split('\n'),WD=document.words||amountWords(total());
const box=(t,b,c)=>`<div class="bx ${c||''}"><div class="lb">${t}</div><div class="bv">${b}</div></div>`;
const exp=h('Exporter').split('\n'),con=h('Consignee').split('\n');
const nm=a=>`<b class="nm">${E(a[0]||'')}</b><br>${a.slice(1).map(E).join('<br>')}`;
const top=(ttl)=>`<div class="ban">SHRIYA MINING INDUSTRIES</div><div class="ttl">${ttl}</div>
<div class="g2"><div>${box('Exporter',nm(exp))}${box('Consignee',nm(con))}</div>
<div>${box('Invoice no &amp; Date',`<b class="nm">${E(h('Invoice no'))}</b><span class="r">${E(dd)}</span>`)}${box("Buyer's order no &amp; Date",`<b>PO NO ${E(h('Buyer PO nos'))}</b><span class="r">DATE ${E(pdd)}</span><br>Other reference(s): ${E(h('Other reference'))}`)}${box('Buyer (if other than consignee)',E(h('Buyer (if other)'))||'&nbsp;')}${box('Notify Party',`<b class="nm">${E(np[0]||'')}</b><br>${E(np.slice(1).join(', '))}`)}</div></div>
<div class="g4">${box('Pre-carriage by',E(h('Pre-carriage by')))}${box('Place of receipt',E(h('Place of receipt')))}${box('Country of origin',E(h('Country of origin')))}${box('Final destination',E(h('Final destination')))}</div>
<div class="g2b"><div class="g2c">${box('Vessel / Flight No',E(h('Vessel / Flight')))}${box('Port of loading',E(h('Port of loading')))}${box('Port of destination',E(h('Port of discharge')))}${box('Final destination',E(h('Final delivery')))}</div>${box('Terms of payment &amp; delivery','PAYMENT : '+E(h('Payment terms')))}</div>`;
let lk=null,z=0;
const body=(inv)=>{let o='';L.forEach(l=>{if(l.kind&&l.kind!==lk){o+=`<tr class="sec"><td colspan="5">${E(l.kind)}${l.kind=='GRANITE TILES'?'&emsp;&emsp;HSN CODE 68022310':''}</td></tr>`;lk=l.kind;z=0}
 const cn=parseInt(l.crates)||0,zb=z++%2?' zb':'';
 o+=`<tr class="it${zb}"><td class="mk"><b>${l.crt?'CRT NO '+E(l.crt):''}</b><br><span>${cn>0?String(cn).padStart(2,'0')+(cn>1?' CRATES':' CRATE'):''}</span></td><td class="ds"><b>${E((l.stone+'  '+l.finish).trim())}</b>${l.size?` &nbsp;<b>${E(l.size)}</b>`:''}<br><i>${E(l.ref)}</i></td>`+
  `<td class="n">${qf(l)}</td><td class="n">${+l.net?nf(l.net,3):''}</td><td class="n am">${nf(amt(l),2)}</td>`+'</tr>'});return o};
lk=null;z=0;const B1=body(true);lk=null;z=0;const B2=body(false);
const th=(a,b,c)=>`<thead><tr><th>Marks &amp; No's</th><th>Description of goods</th><th>${a[0]}</th><th>${a[1]}</th><th>${a[2]}</th></tr><tr class="sb"><th>Container</th><th>${[tc?String(tc).padStart(2,'0')+' NOS':'',h('Packing'),h('Grade')].filter(Boolean).map(E).join(' &middot; ')}</th><th>${b[0]}</th><th>${b[1]}</th><th>${b[2]}</th></tr></thead>`;
const cont=`<tr class="ft"><td></td><td><b>${h('Container no')?'CONT # '+E(h('Container no')):''}</b></td><td colspan="3"></td></tr>`;
const sign=`<div class="g2 dc"><div class="bx"><div class="lb">Declaration</div><div class="bv sm">We declare that this Invoice shows the actual price of the goods described and that all particulars are true and correct.</div></div><div class="bx sg"><div class="lb">Signature &amp; Date</div><div class="bv" style="text-align:center"><b class="nm">For SHRIYA MINING INDUSTRIES</b><div style="height:34px"></div><span class="sm">Authorised Signatory</span></div></div></div>`;
const p1=`<section class="pg">${top('INVOICE')}<table class="gd">${th(['Quantity','Weight','Amount'],['Qty / Unit','Weight','USD'])}<tbody><tr class="mc"><td><b>${E(h('Marks code'))}</b></td><td colspan="4"></td></tr>${B1}${cont}</tbody></table>
<div class="tt"><div class="wd"><div class="lb">Amount chargeable in words</div><b>${E(WD)}</b></div><div class="tq">${tq}</div><div class="tl">TOTAL (USD)</div><div class="ta">$${nf(total(),2)}</div></div>${sign}</section>`;
const p2=`<section class="pg">${top('PACKING LIST')}<table class="gd pk">${th(['Quantity','Weight','Amount'],['Qty','Weight','USD'])}<tbody><tr class="mc"><td><b>${E(h('Marks code'))}</b></td><td colspan="4"></td></tr>${B2}${cont}<tr class="tr"><td colspan="2">TOTAL</td><td class="n">${tq}</td><td class="n">${nf(tn,3)}</td><td class="n">${nf(total(),2)}</td></tr></tbody></table>
<div class="tw">TOTAL WEIGHT : ${nf(tn,3)} KGS</div>${sign}</section>`;
const css=`@page{size:A4;margin:10mm 9mm 12mm}*{box-sizing:border-box}html,body{margin:0}body{font:10pt/1.35 Calibri,Carlito,Arial,sans-serif;color:#1b2430;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{page-break-after:always;border:2px solid #7a5c3e;border-radius:2px;overflow:hidden}.pg:last-child{page-break-after:auto}
.ban{background:#7a5c3e;color:#fff;text-align:center;font-weight:700;font-size:19pt;letter-spacing:1.5px;padding:7px}.ttl{background:#f1e5d7;color:#7a5c3e;text-align:center;font-weight:700;font-size:13pt;padding:4px;border-bottom:1px solid #c8bead}
.g2{display:grid;grid-template-columns:1fr 1fr}.g4{display:grid;grid-template-columns:repeat(4,1fr)}.g2b{display:grid;grid-template-columns:2fr 1fr}.g2c{display:grid;grid-template-columns:repeat(4,1fr)}.g2b>.bx,.g2c>.bx{height:100%}
.bx{border:.6pt solid #c8bead;margin:0 0 -.6pt -.6pt}.lb{background:#f7f3ee;color:#7a5c3e;font-size:7.5pt;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:2px 6px;border-bottom:.6pt solid #c8bead}.bv{padding:4px 6px;min-height:20px}
.nm{color:#7a5c3e;font-size:11pt}.r{float:right;font-weight:700}.sm{font-size:8.5pt;color:#5b6578}
table.gd{width:100%;border-collapse:collapse;margin-top:-.6pt}.gd th{background:#7a5c3e;color:#fff;padding:4px 6px;font-size:10pt;border:.6pt solid #c8bead}.gd tr.sb th{background:#f1e5d7;color:#7a5c3e;font-size:8.5pt}
.gd td{padding:3px 6px;border-left:.6pt solid #c8bead;border-right:.6pt solid #c8bead;vertical-align:top}.gd tr{page-break-inside:avoid}
.gd tr.sec td{background:#f1e5d7;color:#7a5c3e;font-weight:700;padding:4px 8px;border-top:.6pt solid #c8bead}.gd tr.it td{border-bottom:.4pt solid #d3dbe8}.gd tr.zb td{background:#f7f3ee}
.gd td.mk{width:20%;color:#7a5c3e}.gd td.mk span{font-size:9pt}.gd td.ds i{color:#5b6578;font-size:8.5pt}.gd td.n{text-align:right;white-space:nowrap}.gd td.am{font-weight:700;color:#6b7052}
.gd tr.mc td{color:#7a5c3e;padding:4px 6px}.gd tr.ft td{border-bottom:.6pt solid #c8bead;padding:5px 6px;color:#7a5c3e}.gd tr.tr td{background:#7a5c3e;color:#fff;font-weight:700;padding:5px 6px}.gd tr.tr td.n{background:#f7e2a8;color:#1b2430}
.pk td.n,.gd th:nth-child(n+3){text-align:right}.gd th:nth-child(2){text-align:left}.gd th:first-child{text-align:left}
.tt{display:grid;grid-template-columns:1fr auto auto auto;align-items:stretch;border-top:.6pt solid #c8bead;border-bottom:.6pt solid #c8bead}.tt>div{padding:6px 8px;border-right:.6pt solid #c8bead}.tt .wd{color:#7a5c3e}.tt .wd .lb{margin:-6px -8px 4px;border-right:0}
.tq{background:#f7f3ee;font-weight:700;display:flex;align-items:center}.tl{background:#7a5c3e;color:#fff;font-weight:700;font-size:8.5pt;display:flex;align-items:center}.ta{background:#f7e2a8;color:#7a5c3e;font-weight:700;font-size:13pt;display:flex;align-items:center;border-right:0!important}
.tw{background:#f7f3ee;font-weight:700;padding:5px 8px;border-top:.6pt solid #c8bead}.dc{margin-top:0;page-break-inside:avoid}
@media screen{
 html{background:#e8e4de}
 body{padding:24px 12px}
 .pg{width:min(794px,100%);margin:0 auto 24px;background:#fff;box-shadow:0 6px 24px rgba(42,37,32,.18)}
 table.gd{table-layout:fixed}
 .gd th,.gd td{overflow-wrap:anywhere}
 .gd td.n{overflow-wrap:normal}
}
@media print{
 body{padding:0}
 .pg{width:auto;margin:0 auto;box-shadow:none}
 .gd th,.gd td{overflow-wrap:normal}
}`;
return`<!doctype html><html><head><meta charset="utf-8"><title>${E(title)}</title><style>${css}</style></head><body>${p1}${p2}</body></html>`}
