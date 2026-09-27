const DB='furusatoStandaloneDB', DOCS='documents', LOGS='logs', META='meta';
const DATA_URL='./furusato-data.json';
let state={documents:[],logs:[],manual:{},dataMeta:null};
const $=id=>document.getElementById(id);
const yen=n=>n==null?'—':Math.round(n).toLocaleString('ja-JP')+'円';
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function addLog(msg,obj={}){const e={time:new Date().toISOString(),msg,...obj};state.logs.push(e);if($('log'))$('log').textContent=state.logs.map(x=>JSON.stringify(x)).join('\n');putLog(e).catch(()=>{});return e}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,3);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(DOCS))db.createObjectStore(DOCS,{keyPath:'id'});if(!db.objectStoreNames.contains(LOGS))db.createObjectStore(LOGS,{keyPath:'id',autoIncrement:true});if(!db.objectStoreNames.contains(META))db.createObjectStore(META,{keyPath:'key'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function tx(store,mode,fn){const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction(store,mode),s=t.objectStore(store);let out;try{out=fn(s)}catch(e){rej(e);return}t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error)})}
const putDoc=d=>tx(DOCS,'readwrite',s=>s.put(d));
const allDocs=()=>tx(DOCS,'readonly',s=>new Promise((res,rej)=>{const r=s.getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
const putLog=e=>tx(LOGS,'readwrite',s=>s.add(e));
const allLogs=()=>tx(LOGS,'readonly',s=>new Promise((res,rej)=>{const r=s.getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
const putMeta=v=>tx(META,'readwrite',s=>s.put(v));
const getMeta=key=>tx(META,'readonly',s=>new Promise((res,rej)=>{const r=s.get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));

function makeId(d){return d.id||`data-${d.year||new Date().getFullYear()}-${d.kind||'salary'}-${d.month||0}-${d.name||''}`}
function normalizeDoc(x,index,sourceName){
 const d={...x};
 d.id=makeId(d); d.year=Number(d.year); d.month=d.month==null?null:Number(d.month); d.kind=d.kind||'unknown'; d.name=d.name||`${d.year||'unknown'}-${d.month||'annual'}-${d.kind}`;
 d.needsReview=Boolean(d.needsReview); d.status=d.status||'parsed'; d.source=d.source||sourceName||'chatgpt-library-import';
 if(d.kind==='salary'){
   const required=['year','month','taxable','social'];
   d.missingFields=Array.isArray(d.missingFields)?d.missingFields:required.filter(k=>d[k]==null);
   d.needsReview=d.needsReview||d.missingFields.length>0; d.status=d.needsReview?'review':'parsed';
 }
 return d;
}
function taxableCheck(d){
 if(d.kind!=='salary' || d.taxable==null || d.totalPayment==null || d.nonTaxable==null)return {status:'not-checkable',text:'照合材料不足'};
 const expected=num(d.totalPayment)-num(d.nonTaxable), diff=num(d.taxable)-expected;
 return diff===0?{status:'ok',text:'支給合計－非課税額＝課税対象額'}:{status:'warn',text:`課税対象額と単純差引が${yen(diff)}不一致（明細の内訳を優先して要確認）`};
}
function relatedFields(d){return Object.keys(d).filter(k=>/持株|stock|ownership/i.test(k)).map(k=>`${k}=${typeof d[k]==='object'?JSON.stringify(d[k]):d[k]}`)}

async function seedIfEmpty(){
 state.documents=await allDocs();
 if(state.documents.length)return false;
 try{
   const res=await fetch(`${DATA_URL}?t=${Date.now()}`,{cache:'no-store'});
   if(!res.ok)throw new Error(`公開シード取得失敗: HTTP ${res.status}`);
   const parsed=await res.json();
   const list=Array.isArray(parsed)?parsed:(Array.isArray(parsed.documents)?parsed.documents:[]);
   if(!list.length){state.dataMeta={key:'dataSource',updatedAt:null,source:'公開用空シード',documentCount:0};await putMeta(state.dataMeta);return false;}
   for(const raw of list)await putDoc(normalizeDoc(raw,0,'public-seed'));
   state.dataMeta={key:'dataSource',updatedAt:new Date().toISOString(),source:'公開シード',documentCount:list.length};
   await putMeta(state.dataMeta);addLog('初回シード反映',{count:list.length});return true;
 }catch(e){addLog('初回シード反映ERROR',{error:String(e)});return false}
}

async function applyPayload(){
 const text=$('dataPayload').value.trim(); if(!text){alert('ChatGPTが作ったJSONを貼り付けてください。');return}
 let parsed;try{parsed=JSON.parse(text)}catch(e){addLog('JSON解析ERROR',{error:String(e)});alert('JSONとして読み取れません。ChatGPTのJSONをそのまま貼り付けてください。');return}
 const list=Array.isArray(parsed)?parsed:(Array.isArray(parsed.documents)?parsed.documents:[]);
 if(!list.length){alert('documents が見つかりません。');return}
 const normalized=list.map((raw,i)=>normalizeDoc(raw,i,'chatgpt-library-import'));
 let added=0,updated=0;
 const existing=new Map((await allDocs()).map(d=>[d.id,d]));
 for(const d of normalized){if(existing.has(d.id))updated++;else added++;await putDoc(d)}
 if(parsed.manual && typeof parsed.manual==='object'){
   for(const [year,m] of Object.entries(parsed.manual)){state.manual[year]={...manualFor(Number(year)),...m,year:Number(year)};await putMeta({key:`manual-${year}`,...state.manual[year]})}
 }
 state.documents=await allDocs();state.dataMeta={key:'dataSource',updatedAt:new Date().toISOString(),source:'ChatGPT Library → JSON → 端末DB',documentCount:state.documents.length};await putMeta(state.dataMeta);
 addLog('ChatGPTデータ反映',{received:list.length,added,updated,total:state.documents.length});
 $('dataPayload').value='';renderSync();render();
 alert(`反映しました。追加 ${added}件／更新 ${updated}件\n保存DB合計 ${state.documents.length}件`);
}

function salaryDeduction2025(gross){if(gross<=1900000)return 650000;if(gross<=3600000)return gross*.3+80000;if(gross<=6600000)return gross*.2+440000;if(gross<=8500000)return gross*.1+1100000;return 1950000}
function basicDeduction2025(income){if(income<=1320000)return 950000;if(income<=3360000)return 880000;if(income<=4890000)return 680000;if(income<=6550000)return 630000;if(income<=23500000)return 580000;return income<=24000000?480000:income<=24500000?320000:income<=25000000?160000:0}
function incomeTaxRate2025(t){if(t<=1949000)return .05;if(t<=3299000)return .10;if(t<=6949000)return .20;if(t<=8999000)return .23;if(t<=17999000)return .33;if(t<=39999000)return .40;return .45}
function manualFor(year){return state.manual[String(year)]||{year,specialPayment:0,lifeInsuranceDeduction:0,earthquakeInsuranceDeduction:0,ideco:0,taxableAdjustment:0,note:''}}
function forecast(year,docs){
 const m=manualFor(year);
 const sal=docs.filter(d=>d.kind==='salary'&&d.year===year&&!d.needsReview).sort((a,b)=>(a.month||0)-(b.month||0));
 if(sal.length===0)return null;
 const actual=sal.filter(d=>d.month>=1&&d.month<=11);if(actual.length===0)return null;
 const sum=k=>actual.reduce((s,d)=>s+num(d[k]),0);const actualMonths=new Set(sal.map(d=>d.month));
 let yearTax=sum('taxable'),decTax=null,decSource='';const dec=sal.find(d=>d.month===12);
 let forecastBase=actual.filter(d=>[9,10,11].includes(d.month));if(forecastBase.length<3)forecastBase=actual.slice(-3);
 const forecastAvg=k=>forecastBase.reduce((s,d)=>s+num(d[k]),0)/forecastBase.length;
 if(dec){decTax=num(dec.taxable);yearTax+=decTax;decSource='12月実績'}else{decTax=forecastAvg('taxable');yearTax+=decTax;decSource=forecastBase.map(d=>`${d.month}月`).join('・')+'平均による予測'}
 yearTax+=num(m.specialPayment)+num(m.taxableAdjustment);
 const avgSalarySoc=sum('social'),avgSocMonthly=forecastAvg('social');let salarySoc=avgSalarySoc;if(!dec)salarySoc+=avgSocMonthly;else salarySoc+=num(dec.social);
 const currentBonuses=docs.filter(d=>d.kind==='bonus'&&d.year===year&&!d.needsReview);const currentWinter=currentBonuses.find(d=>Number(d.month)===12||/冬|winter/i.test(String(d.name||'')));const priorWinter=docs.filter(d=>d.kind==='bonus'&&d.year===year-1&&!d.needsReview).find(d=>Number(d.month)===12||/冬|winter/i.test(String(d.name||'')));
 const currentBonusTax=currentBonuses.reduce((s,d)=>s+num(d.taxable??d.amount),0),currentBonusSoc=currentBonuses.reduce((s,d)=>s+num(d.social),0),forecastWinter=currentWinter?null:priorWinter,forecastWinterTax=forecastWinter?num(forecastWinter.taxable??forecastWinter.amount):0;
 let forecastWinterSoc=0;if(forecastWinter&&currentBonuses.length){const currentStdHealth=currentBonuses.reduce((s,d)=>s+num(d.standardBonusHealth),0),currentStdPension=currentBonuses.reduce((s,d)=>s+num(d.standardBonusPension),0),healthLike=currentBonuses.reduce((s,d)=>s+num(d.health)+num(d.healthSpecial)+num(d.care)+num(d.childSupport),0),healthBase=Math.max(0,5730000-currentStdHealth),sampleHealthBase=currentStdHealth||currentBonuses.reduce((s,d)=>s+Math.floor(num(d.taxable??d.amount)/1000)*1000,0),healthRate=sampleHealthBase>0?healthLike/sampleHealthBase:0,forecastHealthLike=Math.floor(healthBase/1000)*1000*healthRate,employmentBase=currentBonuses.reduce((s,d)=>s+num(d.taxable??d.amount),0),employmentRate=employmentBase>0?currentBonuses.reduce((s,d)=>s+num(d.employment),0)/employmentBase:0,forecastEmployment=forecastWinterTax*employmentRate,pensionRate=currentStdPension>0?currentBonuses.reduce((s,d)=>s+num(d.pension),0)/currentStdPension:0,forecastPension=Math.min(1500000,Math.floor(forecastWinterTax/1000)*1000)*pensionRate;forecastWinterSoc=Math.round(forecastHealthLike+forecastEmployment+forecastPension)}
 const bonusTaxable=currentBonusTax+forecastWinterTax,bonusSoc=currentBonusSoc+forecastWinterSoc,yearTaxWithBonus=yearTax+bonusTaxable,salaryDeduction=salaryDeduction2025(yearTaxWithBonus),salaryIncome=Math.max(0,yearTaxWithBonus-salaryDeduction),basic=basicDeduction2025(salaryIncome),manualDeductions=num(m.lifeInsuranceDeduction)+num(m.earthquakeInsuranceDeduction)+num(m.ideco),taxableIncome=Math.max(0,Math.floor((salaryIncome-yearSoc-basic-manualDeductions)/1000)*1000),residentShare=taxableIncome*.10,rate=incomeTaxRate2025(taxableIncome),cap=2000+(residentShare*.20)/(0.90-rate*1.021),withholding=docs.find(d=>d.kind==='withholding'&&d.year===year&&!d.needsReview);
 const calcInputs={salaryTaxable:yearTax,bonusTaxable,yearTaxWithBonus,social:yearSoc,salaryDeduction,basic,manualDeductions,taxableIncome,rate,withholdingUsed:false};
 return {year,months:actual.length,actualTax:sum('taxable'),decTax,decSource,yearTax:yearTaxWithBonus,yearSoc,salarySoc,bonusSoc,bonusCount:currentBonuses.length,bonusTaxable,bonusForecastSource:forecastWinter?`前年${year-1}年冬賞与（社保予測 ${yen(forecastWinterSoc)}）`:'実績のみ',salaryDeduction,salaryIncome,basic,manualDeductions,taxableIncome,residentShare,incomeTaxRate:rate,capDonation:Math.floor(cap),withholding:!!withholding,actualMonths:[...actualMonths].sort((a,b)=>a-b),manual:m,calcInputs};
}

function renderSync(){const meta=state.dataMeta;$('syncStatus').innerHTML=meta?`<div class="syncbox"><span class="ok">● 端末DBを使用中</span><br>保存データ：${state.documents.length}件<br>最終更新：${meta.updatedAt?new Date(meta.updatedAt).toLocaleString('ja-JP'):'—'}<br><span class="small">個人データはGitHubへ自動送信されません。</span></div>`:`<div class="syncbox"><span class="warn">● DB情報を確認中</span></div>`}
function renderManual(years){$('manualInputs').innerHTML=years.map(year=>{const m=manualFor(year);return `<div class="manual-card"><h3>${year}年</h3><div class="form-grid"><label>特別支給額（円）<input data-manual-year="${year}" data-key="specialPayment" type="number" min="0" step="1000" value="${m.specialPayment||0}"></label><label>生命保険料控除（円）<input data-manual-year="${year}" data-key="lifeInsuranceDeduction" type="number" min="0" step="1000" value="${m.lifeInsuranceDeduction||0}"></label><label>地震保険料控除（円）<input data-manual-year="${year}" data-key="earthquakeInsuranceDeduction" type="number" min="0" step="1000" value="${m.earthquakeInsuranceDeduction||0}"></label><label>iDeCo・小規模企業共済等（円）<input data-manual-year="${year}" data-key="ideco" type="number" min="0" step="1000" value="${m.ideco||0}"></label><label>給与課税対象額への調整（円）<input data-manual-year="${year}" data-key="taxableAdjustment" type="number" step="1000" value="${m.taxableAdjustment||0}"></label><label>メモ<textarea data-manual-year="${year}" data-key="note" rows="2">${esc(m.note||'')}</textarea></label></div><div class="small">この端末のDBへ保存。変更後は即時再計算します。</div></div>`}).join('');document.querySelectorAll('[data-manual-year]').forEach(el=>el.addEventListener('input',async e=>{const y=Number(e.target.dataset.manualYear),k=e.target.dataset.key,m={...manualFor(y),year:y};m[k]=k==='note'?e.target.value:num(e.target.value);state.manual[String(y)]=m;await putMeta({key:`manual-${y}`,...m});renderOutputs()}))}
function render(){const docs=state.documents.slice().sort((a,b)=>(a.year||0)-(b.year||0)||(a.month||0)-(b.month||0));const years=[...new Set(docs.map(d=>d.year).filter(Boolean))].sort((a,b)=>a-b),sal=docs.filter(d=>d.kind==='salary'),review=docs.filter(d=>d.needsReview);
 $('status').innerHTML=`<div class="grid"><div class="metric"><span>保存データ</span><b>${docs.length}</b></div><div class="metric"><span>給与</span><b>${sal.length}</b></div><div class="metric"><span>賞与</span><b>${docs.filter(d=>d.kind==='bonus').length}</b></div><div class="metric"><span>源泉徴収票</span><b>${docs.filter(d=>d.kind==='withholding').length}</b></div><div class="metric"><span>確認必要</span><b>${review.length}</b></div></div>`;
 $('documents').innerHTML=docs.map(d=>{const check=taxableCheck(d),related=relatedFields(d);return `<details class="db-record"><summary><span>${esc(d.year||'—')}/${d.month?String(d.month).padStart(2,'0'):'—'}　${esc(d.name||'')}</span><span>${d.kind==='salary'?'課税対象 '+yen(d.taxable):d.kind==='bonus'?'賞与 '+yen(d.taxable??d.amount):d.kind}</span></summary><div class="record-body"><div class="record-grid"><div><b>種別</b><br>${esc(d.kind)}</div><div><b>状態</b><br>${d.needsReview?'<span class="warn">確認必要</span>':'<span class="ok">保存済み</span>'}</div><div><b>課税対象額</b><br>${yen(d.taxable)}</div><div><b>支給合計</b><br>${yen(d.totalPayment)}</div><div><b>非課税額</b><br>${yen(d.nonTaxable)}</div><div><b>社会保険</b><br>${yen(d.social)}</div></div><p class="small">課税対象の照合：${check.status==='ok'?'<span class="ok">OK</span>':check.status==='warn'?'<span class="warn">要確認</span>':'—'} ${esc(check.text)}</p>${related.length?`<p class="small"><b>持株関連フィールド（保存済み）</b><br>${related.map(esc).join('<br>')}<br>※保存はしますが、上限計算へ自動加算はしません。</p>`:''}<details><summary>この資料の全フィールドを表示</summary><pre>${esc(JSON.stringify(d,null,2))}</pre></details></div></details>`}).join('')||'<p class="small">まだデータがありません。ChatGPTからJSONを反映してください。</p>';
 renderManual(years);renderOutputs();renderRawSummary(docs);
}
function renderRawSummary(docs){const fields=[...new Set(docs.flatMap(d=>Object.keys(d)))].sort();const missing=docs.filter(d=>d.kind==='salary'&&d.missingFields?.length);const stockDocs=docs.filter(d=>relatedFields(d).length);const rows=fields.map(k=>`<tr><td>${esc(k)}</td><td>${docs.filter(d=>Object.prototype.hasOwnProperty.call(d,k)).length}</td></tr>`).join('');$('details').dataset.rawFields=JSON.stringify(fields);$('details').dataset.rawCount=docs.length;window.__rawSummary={fields,missing:missing.map(d=>({id:d.id,fields:d.missingFields})),stockDocs:stockDocs.map(d=>d.id)} }
function renderOutputs(){const docs=state.documents.slice().sort((a,b)=>(a.year||0)-(b.year||0)||(a.month||0)-(b.month||0));const years=[...new Set(docs.map(d=>d.year).filter(Boolean))].sort((a,b)=>a-b);
 $('stage').innerHTML=years.map(y=>{const f=forecast(y,docs);if(!f)return `<div class="stagebox">${y}年：計算に使える給与実績がありません。</div>`;return `<div class="stagebox"><b>${y}年：${f.decSource==='12月実績'?'実績反映ステージ':'予測ステージ'}</b><br>給与実績：${f.actualMonths.join('・')}月<br>${f.decSource==='12月実績'?'12月実績を反映':'12月は直前実績から予測'}<br>賞与：${yen(f.bonusTaxable)}（${esc(f.bonusForecastSource)}）<br>源泉徴収票：${f.withholding?'保存済み・予測には不使用':'未登録'}</div>`}).join('')||'<div class="stagebox">データが反映されると、予測を開始します。</div>';
 $('summary').innerHTML=years.map(y=>{const f=forecast(y,docs);if(!f)return '';return `<h3>${y}年</h3><div class="grid"><div class="metric"><span>給与課税対象額</span><b>${yen(f.yearTax-f.bonusTaxable)}</b></div><div class="metric"><span>賞与</span><b>${yen(f.bonusTaxable)}</b></div><div class="metric"><span>社会保険料</span><b>${yen(f.yearSoc)}</b></div><div class="metric"><span>給与所得</span><b>${yen(f.salaryIncome)}</b></div><div class="metric"><span>基礎控除</span><b>${yen(f.basic)}</b></div><div class="metric"><span>手動控除等</span><b>${yen(f.manualDeductions)}</b></div><div class="metric"><span>比較用課税所得</span><b>${yen(f.taxableIncome)}</b></div><div class="metric"><span>寄附上限 仮試算</span><b>${yen(f.capDonation)}</b></div></div>`}).join('');
 const calc=years.map(y=>{const f=forecast(y,docs);return f?`<div class="file"><b>${y}年：計算に実際に使った値</b><br>給与：${yen(f.yearTax-f.bonusTaxable)}（明細の <code>taxable</code> 合計＋12月予測/実績＋手動課税調整）<br>賞与：${yen(f.bonusTaxable)}（明細の <code>taxable</code>/<code>amount</code>）<br>社会保険：${yen(f.yearSoc)}<br>給与所得控除：${yen(f.salaryDeduction)} ／ 基礎控除：${yen(f.basic)} ／ 手動控除：${yen(f.manualDeductions)}<br>源泉徴収票：${f.withholding?'保存済みだが予測計算には不使用':'未登録'}<br><span class="small">持株関連フィールドは保存・確認対象ですが、現在の計算式には自動加算していません。給与明細の課税対象額そのものを計算基準にします。</span></div>`:''}).join('');
 $('details').innerHTML=`<div class="file"><b>DBフィールド一覧</b><br>${(window.__rawSummary?.fields||[]).map(f=>`<code>${esc(f)}</code>`).join(' ・ ')||'まだありません'}<br><span class="small">資料ごとの「全フィールド」は上の各レコードを開いて確認できます。</span></div>${calc}`;
}
async function loadManual(){for(const y of await getManualYears()){const m=await getMeta(`manual-${y}`);if(m)state.manual[String(y)]=m}}
async function getManualYears(){return [...new Set(state.documents.map(d=>d.year).filter(Boolean))]}
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:`${type};charset=utf-8`}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('copyRequest').onclick=async()=>{try{await navigator.clipboard.writeText($('requestText').textContent.trim());$('copyRequest').textContent='コピーしました';setTimeout(()=>$('copyRequest').textContent='ChatGPTへの更新依頼文をコピー',1500)}catch(e){addLog('依頼文コピーERROR',{error:String(e)});alert('コピーできませんでした。文章を長押ししてコピーしてください。')}};
$('applyPayload').onclick=applyPayload;
$('clearPayload').onclick=()=>$('dataPayload').value='';
$('exportLog').onclick=()=>download('furusato_debug.txt',state.logs.map(x=>JSON.stringify(x)).join('\n')||'log empty','text/plain');
$('exportDb').onclick=()=>download('furusato_db.json',JSON.stringify({documents:state.documents,manual:state.manual},null,2),'application/json');
async function boot(){state.documents=await allDocs();state.logs=await allLogs();state.dataMeta=await getMeta('dataSource');await loadManual();await seedIfEmpty();state.documents=await allDocs();state.dataMeta=await getMeta('dataSource');renderSync();render();const bootLog={time:new Date().toISOString(),msg:'起動',db:DB,importMode:'ChatGPT JSON paste',manualInput:'enabled',withholdingPolicy:'prediction-excludes-withholding',rawFieldsVisible:true};state.logs.push(bootLog);await putLog(bootLog);$('log').textContent=state.logs.map(x=>JSON.stringify(x)).join('\n')}
boot().catch(e=>{console.error(e);$('log').textContent=String(e?.stack||e)});
