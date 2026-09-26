const DB='furusatoStandaloneDB', DOCS='documents', LOGS='logs', META='meta', YEAR=2025;
let state={documents:[],logs:[]};
const $=id=>document.getElementById(id);
const yen=n=>n==null?'—':Math.round(n).toLocaleString('ja-JP')+'円';
function addLog(msg,obj={}){const e={time:new Date().toISOString(),msg,...obj};state.logs.push(e);$('log').textContent=state.logs.map(x=>JSON.stringify(x)).join('\n');return e}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,2);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(DOCS))db.createObjectStore(DOCS,{keyPath:'id'});if(!db.objectStoreNames.contains(LOGS))db.createObjectStore(LOGS,{keyPath:'id',autoIncrement:true});if(!db.objectStoreNames.contains(META))db.createObjectStore(META,{keyPath:'key'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function tx(store,mode,fn){const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction(store,mode);const s=t.objectStore(store);let out;try{out=fn(s)}catch(e){rej(e);return}t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error)})}
const putDoc=d=>tx(DOCS,'readwrite',s=>s.put(d));
const allDocs=()=>tx(DOCS,'readonly',s=>new Promise((res,rej)=>{const r=s.getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
const putLog=e=>tx(LOGS,'readwrite',s=>s.add(e));
const allLogs=()=>tx(LOGS,'readonly',s=>new Promise((res,rej)=>{const r=s.getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
async function clearDB(){const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction([DOCS,LOGS,META],'readwrite');t.objectStore(DOCS).clear();t.objectStore(LOGS).clear();t.objectStore(META).clear();t.oncomplete=res;t.onerror=()=>rej(t.error)})}
function makeId(d){return d.id||`data-${d.year||YEAR}-${d.kind||'salary'}-${d.month||0}-${d.name||''}`}
function normalizeDoc(x,index,sourceName){
 const d={...x};
 d.id=makeId(d); d.year=Number(d.year??YEAR); d.month=d.month==null?null:Number(d.month); d.kind=d.kind||'salary'; d.name=d.name||`${d.year}-${d.month||'annual'}-${d.kind}`;
 d.needsReview=Boolean(d.needsReview); d.status=d.status||'parsed'; d.source=d.source||sourceName||'imported-data';
 if(d.kind==='salary'){
   const required=['year','month','taxable','social'];
   d.missingFields=Array.isArray(d.missingFields)?d.missingFields:required.filter(k=>d[k]==null);
   d.needsReview=d.missingFields.length>0; d.status=d.needsReview?'review':'parsed';
 }
 return d;
}
async function importJsonFiles(files){
 for(const file of files){
  try{
   const parsed=JSON.parse(await file.text());
   const list=Array.isArray(parsed)?parsed:(Array.isArray(parsed.documents)?parsed.documents:[]);
   if(!list.length) throw new Error('documents配列がありません');
   let added=0,updated=0;
   for(const raw of list){
    const d=normalizeDoc(raw,added,file.name); const existing=state.documents.find(x=>x.id===d.id);
    await putDoc(d); existing?updated++:added++;
   }
   addLog('データ取込',{file:file.name,count:list.length,added,updated});
  }catch(e){addLog('データ取込ERROR',{file:file.name,error:String(e),stack:e?.stack||''})}
 }
 state.documents=await allDocs(); state.logs=await allLogs(); render();
}
function salaryDeduction2025(gross){if(gross<=1900000)return 650000;if(gross<=3600000)return gross*.3+80000;if(gross<=6600000)return gross*.2+440000;if(gross<=8500000)return gross*.1+1100000;return 1950000}
function basicDeduction2025(income){if(income<=1320000)return 950000;if(income<=3360000)return 880000;if(income<=4890000)return 680000;if(income<=6550000)return 630000;if(income<=23500000)return 580000;return income<=24000000?480000:income<=24500000?320000:income<=25000000?160000:0}
function incomeTaxRate2025(t){if(t<=1949000)return .05;if(t<=3299000)return .10;if(t<=6949000)return .20;if(t<=8999000)return .23;if(t<=17999000)return .33;if(t<=39999000)return .40;return .45}
function forecast(docs){
 const sal=docs.filter(d=>d.kind==='salary'&&d.year===YEAR&&!d.needsReview).sort((a,b)=>(a.month||0)-(b.month||0));
 const actual=sal.filter(d=>d.month>=1&&d.month<=11); if(actual.length===0)return null;
 const sum=k=>actual.reduce((s,d)=>s+(Number(d[k])||0),0);
 const avgTax=sum('taxable')/actual.length, decTax=avgTax, yearTax=sum('taxable')+decTax;
 const avgSoc=sum('social')/actual.length, yearSoc=sum('social')+avgSoc;
 const salaryDeduction=salaryDeduction2025(yearTax), salaryIncome=Math.max(0,yearTax-salaryDeduction);
 const basic=basicDeduction2025(salaryIncome);
 const taxableIncome=Math.max(0,Math.floor((salaryIncome-yearSoc-basic)/1000)*1000);
 const residentShare=taxableIncome*.10, rate=incomeTaxRate2025(taxableIncome);
 const cap=2000+(residentShare*.20)/(0.90-rate*1.021);
 const bonus=docs.filter(d=>d.kind==='bonus'&&d.year===YEAR&&!d.needsReview);
 return {months:actual.length,actualTax:sum('taxable'),decTax,yearTax,avgSoc,yearSoc,salaryDeduction,salaryIncome,basic,taxableIncome,residentShare,incomeTaxRate:rate,capDonation:Math.floor(cap),bonusCount:bonus.length,bonusTaxable:bonus.reduce((s,d)=>s+(Number(d.taxable??d.amount)||0),0)};
}
function render(){
 const docs=state.documents.slice().sort((a,b)=>(a.year||0)-(b.year||0)||(a.month||0)-(b.month||0));
 const sal=docs.filter(d=>d.kind==='salary'), parsed=sal.filter(d=>!d.needsReview);
 $('status').innerHTML=`<div class="grid"><div class="metric"><span>給与データ</span><b>${sal.length}</b></div><div class="metric"><span>利用可能</span><b>${parsed.length}</b></div><div class="metric"><span>確認必要</span><b>${sal.filter(d=>d.needsReview).length}</b></div><div class="metric"><span>重複登録</span><b>防止済</b></div></div>`;
 $('documents').innerHTML=docs.map(d=>`<div class="row"><span>${d.year||'—'}/${String(d.month||'').padStart(2,'0')} ${d.name||''}</span><span>${d.needsReview?'<span class="warn">確認必要</span>':'<span class="ok">利用可能</span>'}</span><span>${d.kind==='salary'?yen(d.taxable):yen(d.taxable??d.amount)}</span></div>`).join('')||'<p class="small">まだデータがありません。</p>';
 const f=forecast(docs);
 $('stage').innerHTML=f?`<div class="stagebox"><b>現在：予測ステージ</b><br>${YEAR}年1〜11月の保存済み実績 ${f.months}か月から12月給与を予測しています。<strong>手動入力：0円／源泉徴収票：未使用</strong><br>12月予測は1〜11月の課税対象額の平均、社会保険は同期間の平均を使用します。</div>`:'<div class="stagebox">読み取り済みデータを取り込むと、予測を開始します。</div>';
 $('summary').innerHTML=f?`<div class="grid"><div class="metric"><span>1〜11月 課税対象額</span><b>${yen(f.actualTax)}</b></div><div class="metric"><span>12月給与予測</span><b>${yen(f.decTax)}</b></div><div class="metric"><span>給与年間予測</span><b>${yen(f.yearTax)}</b></div><div class="metric"><span>社会保険料年間予測</span><b>${yen(f.yearSoc)}</b></div><div class="metric"><span>給与所得予測</span><b>${yen(f.salaryIncome)}</b></div><div class="metric"><span>基礎控除</span><b>${yen(f.basic)}</b></div><div class="metric"><span>住民税所得割 仮試算</span><b>${yen(f.residentShare)}</b></div><div class="metric"><span>寄附上限 仮試算</span><b>${yen(f.capDonation)}</b></div></div><p class="small">賞与は実績データが取り込まれるまで推測で補完しません。扶養・保険等の年末確定情報も未反映です。源泉徴収票が登録された段階では、別ステージとして最終値を計算します。</p>`:'';
 $('details').innerHTML=docs.map(d=>`<div class="file"><b>${d.name||'データ'}</b><br>種類 ${d.kind} / 支払日 ${d.payDate||d.date||'—'} / 課税 ${yen(d.taxable)} / 支給合計 ${yen(d.totalPayment)} / 社会保険 ${yen(d.social)} / 手取り ${yen(d.net)}${d.needsReview?`<br><span class="warn">不足: ${(d.missingFields||[]).join(', ')}</span>`:''}</div>`).join('');
}
$('dataInput').addEventListener('change',e=>importJsonFiles([...e.target.files]));
$('importData').onclick=()=>$('dataInput').click();
$('clearDb').onclick=async()=>{if(confirm('保存データを消去しますか？')){await clearDB();state={documents:[],logs:[]};render();$('log').textContent=''}};
$('exportLog').onclick=()=>download('furusato_debug.txt',state.logs.map(x=>JSON.stringify(x)).join('\n')||'log empty');
$('exportDb').onclick=()=>download('furusato_db.json',JSON.stringify(state.documents,null,2));
function download(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
state.documents=await allDocs();state.logs=await allLogs();$('log').textContent=state.logs.map(x=>JSON.stringify(x)).join('\n');render();const boot={time:new Date().toISOString(),msg:'起動',db:DB,year:YEAR,manualInput:0,withholdingUsed:false,importMode:'structured-json'};state.logs.push(boot);await putLog(boot);$('log').textContent=state.logs.map(x=>JSON.stringify(x)).join('\n');
