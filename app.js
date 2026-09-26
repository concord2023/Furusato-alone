const DB='furusatoStandaloneDB', DOCS='documents', LOGS='logs', META='meta';
const DATA_URL='./furusato-data.json';
let state={documents:[],logs:[],manual:{}};
const $=id=>document.getElementById(id);
const yen=n=>n==null?'—':Math.round(n).toLocaleString('ja-JP')+'円';
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
function addLog(msg,obj={}){const e={time:new Date().toISOString(),msg,...obj};state.logs.push(e);$('log').textContent=state.logs.map(x=>JSON.stringify(x)).join('\n');return e}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,3);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(DOCS))db.createObjectStore(DOCS,{keyPath:'id'});if(!db.objectStoreNames.contains(LOGS))db.createObjectStore(LOGS,{keyPath:'id',autoIncrement:true});if(!db.objectStoreNames.contains(META))db.createObjectStore(META,{keyPath:'key'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function tx(store,mode,fn){const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction(store,mode);const s=t.objectStore(store);let out;try{out=fn(s)}catch(e){rej(e);return}t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error)})}
const putDoc=d=>tx(DOCS,'readwrite',s=>s.put(d));
const replaceDocs=docs=>tx(DOCS,'readwrite',s=>{s.clear();for(const d of docs)s.put(d)});
const allDocs=()=>tx(DOCS,'readonly',s=>new Promise((res,rej)=>{const r=s.getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
const putLog=e=>tx(LOGS,'readwrite',s=>s.add(e));
const allLogs=()=>tx(LOGS,'readonly',s=>new Promise((res,rej)=>{const r=s.getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
const putMeta=v=>tx(META,'readwrite',s=>s.put(v));
const getMeta=key=>tx(META,'readonly',s=>new Promise((res,rej)=>{const r=s.get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
function makeId(d){return d.id||`data-${d.year||new Date().getFullYear()}-${d.kind||'salary'}-${d.month||0}-${d.name||''}`}
function normalizeDoc(x,index,sourceName){
 const d={...x};
 d.id=makeId(d); d.year=Number(d.year); d.month=d.month==null?null:Number(d.month); d.kind=d.kind||'salary'; d.name=d.name||`${d.year}-${d.month||'annual'}-${d.kind}`;
 d.needsReview=Boolean(d.needsReview); d.status=d.status||'parsed'; d.source=d.source||sourceName||'chatgpt-library-import';
 if(d.kind==='salary'){
   const required=['year','month','taxable','social'];
   d.missingFields=Array.isArray(d.missingFields)?d.missingFields:required.filter(k=>d[k]==null);
   d.needsReview=d.missingFields.length>0; d.status=d.needsReview?'review':'parsed';
 }
 return d;
}
async function syncFromDataFile(){
 const res=await fetch(`${DATA_URL}?t=${Date.now()}`,{cache:'no-store'});
 if(!res.ok)throw new Error(`データファイル取得失敗: HTTP ${res.status}`);
 const parsed=await res.json();
 const list=Array.isArray(parsed)?parsed:(Array.isArray(parsed.documents)?parsed.documents:[]);
 if(!list.length)throw new Error('furusato-data.json に documents がありません');
 const normalized=list.map((raw,i)=>normalizeDoc(raw,i,'chatgpt-library-data'));
 const oldIds=new Set(state.documents.map(d=>d.id));
 const newIds=new Set(normalized.map(d=>d.id));
 const added=normalized.filter(d=>!oldIds.has(d.id)).length;
 const updated=normalized.filter(d=>oldIds.has(d.id)).length;
 const removed=state.documents.filter(d=>!newIds.has(d.id)).length;
 await replaceDocs(normalized);
 const sourceMeta={key:'dataSource',updatedAt:new Date().toISOString(),source:parsed.source||'ChatGPT Library整理データ',documentCount:list.length};
 await putMeta(sourceMeta);
 addLog('アプリ用データ自動同期',{source:DATA_URL,count:list.length,added,updated,removed});
}
function salaryDeduction2025(gross){if(gross<=1900000)return 650000;if(gross<=3600000)return gross*.3+80000;if(gross<=6600000)return gross*.2+440000;if(gross<=8500000)return gross*.1+1100000;return 1950000}
function basicDeduction2025(income){if(income<=1320000)return 950000;if(income<=3360000)return 880000;if(income<=4890000)return 680000;if(income<=6550000)return 630000;if(income<=23500000)return 580000;return income<=24000000?480000:income<=24500000?320000:income<=25000000?160000:0}
function incomeTaxRate2025(t){if(t<=1949000)return .05;if(t<=3299000)return .10;if(t<=6949000)return .20;if(t<=8999000)return .23;if(t<=17999000)return .33;if(t<=39999000)return .40;return .45}
function manualFor(year){return state.manual[String(year)]||{year,specialPayment:0,lifeInsuranceDeduction:0,earthquakeInsuranceDeduction:0,ideco:0,taxableAdjustment:0,note:''}}
function forecast(year,docs){
 const m=manualFor(year);
 const sal=docs.filter(d=>d.kind==='salary'&&d.year===year&&!d.needsReview).sort((a,b)=>(a.month||0)-(b.month||0));
 if(sal.length===0)return null;
 const actual=sal.filter(d=>d.month>=1&&d.month<=11); if(actual.length===0)return null;
 const sum=k=>actual.reduce((s,d)=>s+num(d[k]),0);
 const actualMonths=new Set(sal.map(d=>d.month));
 let yearTax=sum('taxable');
 let decTax=null,decSource='';
 const dec=sal.find(d=>d.month===12);
 let forecastBase=actual.filter(d=>[9,10,11].includes(d.month));
 if(forecastBase.length<3)forecastBase=actual.slice(-3);
 const forecastAvg=k=>forecastBase.reduce((s,d)=>s+num(d[k]),0)/forecastBase.length;
 if(dec){decTax=num(dec.taxable);yearTax+=decTax;decSource='12月実績'}
 else {decTax=forecastAvg('taxable');yearTax+=decTax;decSource=forecastBase.map(d=>`${d.month}月`).join('・')+'平均による予測'}
 yearTax+=num(m.specialPayment)+num(m.taxableAdjustment);
 const avgSalarySoc=sum('social');
 const avgSocMonthly=forecastAvg('social');
 let salarySoc=avgSalarySoc;
 if(!dec)salarySoc+=avgSocMonthly;
 else salarySoc+=num(dec.social);

 // 賞与は当年実績を優先。12月賞与が未登録なら前年12月賞与を「予測」として参照する。
 const currentBonuses=docs.filter(d=>d.kind==='bonus'&&d.year===year&&!d.needsReview);
 const currentWinter=currentBonuses.find(d=>Number(d.month)===12||/冬|winter/i.test(String(d.name||'')));
 const priorWinter=docs.filter(d=>d.kind==='bonus'&&d.year===year-1&&!d.needsReview).find(d=>Number(d.month)===12||/冬|winter/i.test(String(d.name||'')));
 const currentBonusTax=currentBonuses.reduce((s,d)=>s+num(d.taxable??d.amount),0);
 const currentBonusSoc=currentBonuses.reduce((s,d)=>s+num(d.social),0);
 const forecastWinter=currentWinter?null:priorWinter;
 const forecastWinterTax=forecastWinter?num(forecastWinter.taxable??forecastWinter.amount):0;
 let forecastWinterSoc=0;
 if(forecastWinter && currentBonuses.length){
   // 当年の賞与実績から本人負担率を推定し、標準賞与額の上限を反映して冬賞与の社保を予測。
   const currentStdHealth=currentBonuses.reduce((s,d)=>s+num(d.standardBonusHealth),0);
   const currentStdPension=currentBonuses.reduce((s,d)=>s+num(d.standardBonusPension),0);
   const healthLike=currentBonuses.reduce((s,d)=>s+num(d.health)+num(d.healthSpecial)+num(d.care)+num(d.childSupport),0);
   const healthBase=Math.max(0,5730000-currentStdHealth);
   const sampleHealthBase=currentStdHealth||currentBonuses.reduce((s,d)=>s+Math.floor(num(d.taxable??d.amount)/1000)*1000,0);
   const healthRate=sampleHealthBase>0?healthLike/sampleHealthBase:0;
   const forecastHealthLike=Math.floor(healthBase/1000)*1000*healthRate;
   const employmentBase=currentBonuses.reduce((s,d)=>s+num(d.taxable??d.amount),0);
   const employmentRate=employmentBase>0?currentBonuses.reduce((s,d)=>s+num(d.employment),0)/employmentBase:0;
   const forecastEmployment=forecastWinterTax*employmentRate;
   const pensionRate=currentStdPension>0?currentBonuses.reduce((s,d)=>s+num(d.pension),0)/currentStdPension:0;
   const forecastPension=Math.min(1500000,Math.floor(forecastWinterTax/1000)*1000)*pensionRate;
   forecastWinterSoc=Math.round(forecastHealthLike+forecastEmployment+forecastPension);
 }
 const bonusTaxable=currentBonusTax+forecastWinterTax;
 const bonusSoc=currentBonusSoc+forecastWinterSoc;
 const yearTaxWithBonus=yearTax+bonusTaxable;
 const yearSoc=salarySoc+bonusSoc;
 const salaryDeduction=salaryDeduction2025(yearTaxWithBonus), salaryIncome=Math.max(0,yearTaxWithBonus-salaryDeduction);
 const basic=basicDeduction2025(salaryIncome);
 const manualDeductions=num(m.lifeInsuranceDeduction)+num(m.earthquakeInsuranceDeduction)+num(m.ideco);
 const taxableIncome=Math.max(0,Math.floor((salaryIncome-yearSoc-basic-manualDeductions)/1000)*1000);
 const residentShare=taxableIncome*.10, rate=incomeTaxRate2025(taxableIncome);
 const cap=2000+(residentShare*.20)/(0.90-rate*1.021);
 const withholding=docs.find(d=>d.kind==='withholding'&&d.year===year&&!d.needsReview);
 return {year,months:actual.length,actualTax:sum('taxable'),decTax,decSource,yearTax:yearTaxWithBonus,yearSoc,salarySoc,bonusSoc,bonusCount:currentBonuses.length,bonusTaxable,bonusForecastSource:forecastWinter?`前年${year-1}年冬賞与（社保予測 ${yen(forecastWinterSoc)}）`:'なし',salaryDeduction,salaryIncome,basic,manualDeductions,taxableIncome,residentShare,incomeTaxRate:rate,capDonation:Math.floor(cap),withholding:!!withholding,actualMonths:[...actualMonths].sort((a,b)=>a-b),manual:m};
}
function renderSync(){
 const meta=state.dataMeta;
 $('syncStatus').innerHTML=meta?`<div class="syncbox"><span class="ok">● 自動反映中</span><br>データ件数：${meta.documentCount}件<br>最終同期：${new Date(meta.updatedAt).toLocaleString('ja-JP')}<br><span class="small">データ元：ChatGPTがLibrary資料を整理したアプリ用データ</span></div>`:`<div class="syncbox"><span class="warn">● データ未同期</span><br>アプリ用データファイルを確認してください。</div>`;
}
function renderManual(years){
 $('manualInputs').innerHTML=years.map(year=>{const m=manualFor(year);return `<div class="manual-card"><h3>${year}年</h3><div class="form-grid">
 <label>特別支給額（円）<input data-manual-year="${year}" data-key="specialPayment" type="number" min="0" step="1000" value="${m.specialPayment||0}"></label>
 <label>生命保険料控除（円）<input data-manual-year="${year}" data-key="lifeInsuranceDeduction" type="number" min="0" step="1000" value="${m.lifeInsuranceDeduction||0}"></label>
 <label>地震保険料控除（円）<input data-manual-year="${year}" data-key="earthquakeInsuranceDeduction" type="number" min="0" step="1000" value="${m.earthquakeInsuranceDeduction||0}"></label>
 <label>iDeCo・小規模企業共済等（円）<input data-manual-year="${year}" data-key="ideco" type="number" min="0" step="1000" value="${m.ideco||0}"></label>
 <label>給与課税対象額への調整（円）<input data-manual-year="${year}" data-key="taxableAdjustment" type="number" step="1000" value="${m.taxableAdjustment||0}"></label>
 <label>メモ<textarea data-manual-year="${year}" data-key="note" rows="2">${m.note||''}</textarea></label>
 </div><div class="small">入力値はこの端末のDBに保存。変更後は上限試算へ即時反映します。</div></div>`}).join('');
 document.querySelectorAll('[data-manual-year]').forEach(el=>el.addEventListener('input',async e=>{const y=e.target.dataset.manualYear,k=e.target.dataset.key;const m={...manualFor(Number(y)),year:Number(y)};m[k]=k==='note'?e.target.value:num(e.target.value);state.manual[String(y)]=m;await putMeta({key:`manual-${y}`,...m});renderOutputs();}));
}
function render(){
 const docs=state.documents.slice().sort((a,b)=>(a.year||0)-(b.year||0)||(a.month||0)-(b.month||0));
 const years=[...new Set(docs.map(d=>d.year).filter(Boolean))].sort((a,b)=>a-b);
 const sal=docs.filter(d=>d.kind==='salary'), parsed=sal.filter(d=>!d.needsReview);
 $('status').innerHTML=`<div class="grid"><div class="metric"><span>保存データ</span><b>${docs.length}</b></div><div class="metric"><span>給与データ</span><b>${sal.length}</b></div><div class="metric"><span>利用可能</span><b>${parsed.length}</b></div><div class="metric"><span>確認必要</span><b>${sal.filter(d=>d.needsReview).length}</b></div></div>`;
 $('documents').innerHTML=docs.map(d=>`<div class="row"><span>${d.year||'—'}/${String(d.month||'').padStart(2,'0')} ${d.name||''}</span><span>${d.needsReview?'<span class="warn">確認必要</span>':'<span class="ok">利用可能</span>'}</span><span>${d.kind==='salary'?yen(d.taxable):yen(d.taxable??d.amount)}</span></div>`).join('')||'<p class="small">まだデータがありません。</p>';
 renderManual(years);
 renderOutputs();
}
function renderOutputs(){
 const docs=state.documents.slice().sort((a,b)=>(a.year||0)-(b.year||0)||(a.month||0)-(b.month||0));
 const years=[...new Set(docs.map(d=>d.year).filter(Boolean))].sort((a,b)=>a-b);
 $('stage').innerHTML=years.map(y=>{const f=forecast(y,docs);if(!f)return `<div class="stagebox">${y}年：計算に使える給与実績がありません。</div>`;return `<div class="stagebox"><b>${y}年：${f.decSource==='12月実績'?'実績反映ステージ':'予測ステージ'}</b><br>${f.actualMonths.join('・')}月の給与実績を保存。${f.decSource==='12月実績'?'12月実績を反映しています。':'12月は直前までの実績から予測しています。'}<br>賞与：${yen(f.bonusTaxable)}（${f.bonusForecastSource}）<br>源泉徴収票：${f.withholding?'保存済み（比較・最終計算に使用可能）':'予測計算では未使用'}</div>`}).join('')||'<div class="stagebox">データが同期されると、予測を開始します。</div>';
 $('summary').innerHTML=years.map(y=>{const f=forecast(y,docs);if(!f)return '';return `<h3>${y}年</h3><div class="grid"><div class="metric"><span>給与課税対象額</span><b>${yen(f.yearTax)}</b></div><div class="metric"><span>12月給与</span><b>${yen(f.decTax)}</b></div><div class="metric"><span>社会保険料</span><b>${yen(f.yearSoc)}</b></div><div class="metric"><span>給与所得</span><b>${yen(f.salaryIncome)}</b></div><div class="metric"><span>基礎控除</span><b>${yen(f.basic)}</b></div><div class="metric"><span>手動控除等</span><b>${yen(f.manualDeductions)}</b></div><div class="metric"><span>比較用課税所得</span><b>${yen(f.taxableIncome)}</b></div><div class="metric"><span>寄附上限 仮試算</span><b>${yen(f.capDonation)}</b></div></div>`}).join('');
 $('details').innerHTML=years.map(y=>{const f=forecast(y,docs);const m=manualFor(y);return `<div class="file"><b>${y}年</b><br>給与：${f?yen(f.yearTax):'—'} ／ 12月：${f?`${yen(f.decTax)}（${f.decSource}）`:'—'} ／ 賞与：${f?`${yen(f.bonusTaxable)}（${f.bonusForecastSource}）`:'—'}<br>手動入力：特別支給 ${yen(m.specialPayment)}・生命保険 ${yen(m.lifeInsuranceDeduction)}・地震保険 ${yen(m.earthquakeInsuranceDeduction)}・iDeCo ${yen(m.ideco)}・課税調整 ${yen(m.taxableAdjustment)}${m.note?`<br>メモ：${escapeHtml(m.note)}`:''}</div>`}).join('');
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function loadManual(){for(const y of Object.keys(state.manual)){};const years=await getManualYears();for(const y of years){const m=await getMeta(`manual-${y}`);if(m)state.manual[String(y)]=m}}
async function getManualYears(){const docs=state.documents;return [...new Set(docs.map(d=>d.year).filter(Boolean))]}
$('copyRequest').onclick=async()=>{try{await navigator.clipboard.writeText($('requestText').textContent.trim());$('copyRequest').textContent='コピーしました';setTimeout(()=>$('copyRequest').textContent='ChatGPTへの更新依頼文をコピー',1500)}catch(e){addLog('依頼文コピーERROR',{error:String(e)})}};
$('exportLog').onclick=()=>download('furusato_debug.txt',state.logs.map(x=>JSON.stringify(x)).join('\n')||'log empty','text/plain');
$('exportDb').onclick=()=>download('furusato_db.json',JSON.stringify({documents:state.documents,manual:state.manual},null,2),'application/json');
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:`${type};charset=utf-8`}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function boot(){
 state.documents=await allDocs();state.logs=await allLogs();state.dataMeta=await getMeta('dataSource');await loadManual();
 try{await syncFromDataFile();state.documents=await allDocs();state.dataMeta=await getMeta('dataSource')}catch(e){addLog('自動同期ERROR',{error:String(e)});}
 state.logs=await allLogs();$('log').textContent=state.logs.map(x=>JSON.stringify(x)).join('\n');renderSync();render();
 const bootLog={time:new Date().toISOString(),msg:'起動',db:DB,importMode:'chatgpt-library-data-auto-sync',manualInput:'enabled',withholdingPolicy:'prediction-excludes-withholding'};state.logs.push(bootLog);await putLog(bootLog);$('log').textContent=state.logs.map(x=>JSON.stringify(x)).join('\n');
}
boot().catch(e=>{console.error(e);$('log').textContent=String(e?.stack||e)});
