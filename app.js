const DB='furusatoStandaloneDB', DOCS='documents', LOGS='logs', META='meta';
const $=id=>document.getElementById(id);
let state={documents:[],logs:[],manual:{}};
const yen=n=>n==null||!Number.isFinite(Number(n))?'—':Math.round(Number(n)).toLocaleString('ja-JP')+'円';
const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
function addLog(msg,obj={}){const e={time:new Date().toISOString(),msg,...obj};state.logs.push(e);return e}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,3);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(DOCS))db.createObjectStore(DOCS,{keyPath:'id'});if(!db.objectStoreNames.contains(LOGS))db.createObjectStore(LOGS,{keyPath:'id',autoIncrement:true});if(!db.objectStoreNames.contains(META))db.createObjectStore(META,{keyPath:'key'});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function tx(store,mode,fn){const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction(store,mode),s=t.objectStore(store);let out;try{out=fn(s)}catch(e){rej(e);return}t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error)})}
const putDoc=d=>tx(DOCS,'readwrite',s=>s.put(d));
const allDocs=()=>tx(DOCS,'readonly',s=>new Promise((res,rej)=>{const r=s.getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
const putLog=e=>tx(LOGS,'readwrite',s=>s.add(e));
const allLogs=()=>tx(LOGS,'readonly',s=>new Promise((res,rej)=>{const r=s.getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
const getMeta=k=>tx(META,'readonly',s=>new Promise((res,rej)=>{const r=s.get(k);r.onsuccess=()=>res(r.result?.value);r.onerror=()=>rej(r.error)}));
const putMeta=(key,value)=>tx(META,'readwrite',s=>s.put({key,value}));
function inferKind(d){
 const text=[d.kind,d.type,d.name,d.document,d.source,d.fileName,d.filename].filter(Boolean).join(' ').toLowerCase();
 if(/gense[nb]|源泉|withholding/.test(text)) return 'withholding';
 if(/bonus|賞与/.test(text)) return 'bonus';
 if(/chinginmeisai|給与|賃金|payment\s*slip|salary/.test(text)) return 'salary';
 if(d.bonusAmount!=null||d.standardBonusAmounts||d.decreeAmount!=null) return 'bonus';
 if(d.taxableAmount!=null||d.paymentItems||d.deductionItems||d.baseSalaryBreakdown||d.workingRecord) return 'salary';
 return d.kind||d.type||'unknown';
}
function canonicalId(d){return `${d.year||0}-${d.kind||'unknown'}-${d.month??'annual'}-${String(d.document||d.name||d.source||'document').replace(/[^0-9A-Za-z_-]+/g,'_')}`}
function makeId(d){return canonicalId(d)}
function mapNested(d){
 const p=d.paymentItems||{}, q=d.deductionItems||{}, a=d.additionalPaymentItems||{}, w=d.workingRecord||{}, b=d.baseSalaryBreakdown||{}, sm=d.standardMonthlyRemuneration||{}, sb=d.standardBonusAmounts||{};
 const get=(obj,...keys)=>{for(const k of keys)if(obj[k]!=null)return obj[k];return null};
 const health=get(q,'健康保険料（基本','健康保険料（基本）'), healthSpecial=get(q,'健康保険料（特定','健康保険料（特定）');
 const out={...d}; out.kind=inferKind(out); out.name=out.name||out.document||`${out.year||''}-${out.month||''}`; out.payDate=out.payDate||out.payday||out.date||null; out.year=Number(out.year||String(out.payDate||'').slice(0,4)||0); out.month=out.month==null?null:Number(out.month);
 if(out.kind==='salary'){
  out.totalPayment=out.totalPayment??null; out.taxable=out.taxable??out.taxableAmount??null; out.nonTaxable=out.nonTaxable??out.nonTaxableAmount??null; out.additional=out.additional??out.additionalPaymentTotal??null; out.net=out.net??out.netPayment??null;
  out.employment=out.employment??get(q,'雇用保険料'); out.health=out.health??health; out.healthSpecial=out.healthSpecial??healthSpecial; out.care=out.care??get(q,'介護保険料'); out.pension=out.pension??get(q,'年金保険料'); out.incomeTax=out.incomeTax??get(q,'所得税'); out.residentTax=out.residentTax??get(q,'住民税');
  out.childSupport=out.childSupport??get(q,'子ども・子育て支援金'); out.deductions=out.deductions??out.totalDeduction; out.paymentItems=p; out.deductionItems=q; out.additionalPaymentItems=a; out.workingRecord=w; out.baseSalaryBreakdown=b; out.standardMonthlyRemuneration=sm;
 } else if(out.kind==='bonus'){
  out.amount=out.amount??out.bonusAmount??out.totalPayment??null; out.taxable=out.taxable??out.taxableGross??out.amount; out.totalPayment=out.totalPayment??out.amount; out.net=out.net??out.netPayment??null; out.employment=out.employment??get(q,'雇用保険料'); out.health=out.health??get(q,'健康保険料（基本','健康保険料（基本）'); out.healthSpecial=out.healthSpecial??get(q,'健康保険料（特定','健康保険料（特定）'); out.care=out.care??get(q,'介護保険料'); out.pension=out.pension??get(q,'年金保険料'); out.childSupport=out.childSupport??get(q,'子ども・子育て支援金'); out.incomeTax=out.incomeTax??get(q,'所得税'); out.deductions=out.deductions??out.totalDeduction; out.paymentItems=p; out.deductionItems=q; out.standardBonusAmounts=sb;
 }
 return out;
}
function normalizeDoc(raw,sourceName){
 const d=mapNested({...raw}); d.kind=inferKind(d); d.id=makeId(d); d.source=d.source||sourceName||'structured-json'; d.status=d.status||'parsed';
 d.social=d.social==null?deriveSocial(d):num(d.social);
 if(d.kind==='salary'){
   d.missingFields=[];
   if(d.year<=0)d.missingFields.push('year');
   if(d.month==null)d.missingFields.push('month');
   if(d.taxable==null)d.missingFields.push('taxableAmount');
   // A salary slip can be used for the annual limit calculation with the
   // taxable amount alone. totalPayment/nonTaxable/additional/tax/resident
   // are readout-detail fields, not calculation blockers. In particular,
   // the verified 2025/12 record has taxable=804,000 and social=96,931 but
   // those optional fields are unavailable in the structured import.
   // Do not turn that into a false "確認必要" state.
   d.needsReview=d.missingFields.length>0;
 }else{
   d.missingFields=[];
   d.needsReview=false;
 }
 return d;
}
function deriveSocial(d){return ['employment','health','healthSpecial','care','childSupport','pension'].map(k=>num(d[k])).reduce((a,b)=>a+b,0)}
async function importJsonText(text,sourceName='ChatGPT JSON'){
 const parsed=JSON.parse(text); const list=Array.isArray(parsed)?parsed:(Array.isArray(parsed.documents)?parsed.documents:[]); if(!list.length)throw new Error('documents配列がありません');
 let added=0,updated=0; for(const raw of list){const d=normalizeDoc(raw,sourceName);const old=state.documents.find(x=>x.id===d.id);await putDoc(d);old?updated++:added++}
 const log=addLog('データ反映',{source:sourceName,count:list.length,added,updated});await putLog(log);state.documents=await allDocs();state.logs=await allLogs();render();showMessage(`反映完了：${added}件追加、${updated}件更新。DB保存済み`,'ok');
}
function lifeDeduction(premium,type,year,under23=false){const x=num(premium);if(!x)return 0;if(type==='newLife'&&year>=2026&&under23)return x<=30000?x:x<=60000?x/2+15000:x<=120000?x/4+30000:60000;if(type==='new'||type==='newLife')return x<=20000?x:x<=40000?x/2+10000:x<=80000?x/4+20000:40000;if(type==='old')return x<=25000?x:x<=50000?x/2+12500:x<=100000?x/4+25000:50000;return 0}
function calcLife(m,year){
 const under23=Boolean(m.under23Dependent&&year>=2026); const nl=num(m.newLife), ol=num(m.oldLife), np=num(m.newPension), op=num(m.oldPension), med=num(m.medical);
 const general=ol>60000?lifeDeduction(ol,'old',year):Math.min(40000,lifeDeduction(nl,'newLife',year,under23)+lifeDeduction(ol,'old',year));
 const pension=op>60000?lifeDeduction(op,'old',year):Math.min(40000,lifeDeduction(np,'new',year)+lifeDeduction(op,'old',year));
 const medical=Math.min(40000,lifeDeduction(med,'new',year)); const total=Math.min(120000,general+pension+medical);
 return {general,pension,medical,total,raw:{newLife:nl,oldLife:ol,medical:med,newPension:np,oldPension:op}};
}
function earthquakeDeduction(m){const e=num(m.earthquake), old=num(m.oldLongTermDamage); return Math.min(50000,e)+Math.min(15000,old)}
function manualFor(year){return state.manual[String(year)]||{newLife:0,oldLife:0,medical:0,newPension:0,oldPension:0,earthquake:0,oldLongTermDamage:0,ideco:0,nationalPension:0,daughterNationalPension:0,daughterPensionEligible:true,temporary:0,temporaryTaxable:true,under23Dependent:false,note:''}}
function salaryDeduction(gross){if(gross<=1900000)return 650000;if(gross<=3600000)return gross*.3+80000;if(gross<=6600000)return gross*.2+440000;if(gross<=8500000)return gross*.1+1100000;return 1950000}
function basicDeduction(income){if(income<=1320000)return 950000;if(income<=3360000)return 880000;if(income<=4890000)return 680000;if(income<=6550000)return 630000;if(income<=23500000)return 580000;return income<=24000000?480000:income<=24500000?320000:income<=25000000?160000:0}
function incomeTaxRate(t){if(t<=1949000)return .05;if(t<=3299000)return .10;if(t<=6949000)return .20;if(t<=8999000)return .23;if(t<=17999000)return .33;if(t<=39999000)return .40;return .45}
function forecastSalaryTaxable(docs,year){const sal=docs.filter(d=>d.kind==='salary'&&d.year===year&&!d.needsReview&&d.taxable!=null).sort((a,b)=>a.month-b.month),by=new Map(sal.map(d=>[d.month,d])),est={};const baseline=sal.filter(d=>d.month>=4&&d.month<=9).map(d=>num(d.taxable));const fallback=sal.map(d=>num(d.taxable));const base=baseline.length?baseline:fallback;const avg=base.length?base.reduce((a,b)=>a+b,0)/base.length:0;for(let m=1;m<=12;m++){if(by.has(m)){est[m]={value:num(by.get(m).taxable),source:'actual'};continue}if(m>=(Math.max(1,...sal.map(d=>d.month))+1)&&avg){est[m]={value:avg,source:'forecast',basis:baseline.length?'4〜9月実績平均':'取得済み実績平均'}}}return {sal,est,baselineMonths:baseline.length,baselineAverage:avg}}
function bonusForecast(docs,year){const bs=docs.filter(d=>d.kind==='bonus'&&d.year===year&&!d.needsReview);const actual=bs.reduce((s,d)=>s+num(d.taxable??d.amount),0);const actualSocial=bs.reduce((s,d)=>s+num(d.social),0);const winter=bs.find(d=>d.month===12);const priorDocs=docs.filter(d=>d.kind==='bonus'&&d.year===year-1&&d.month===12&&!d.needsReview);const prior=priorDocs.reduce((s,d)=>Math.max(s,num(d.taxable??d.amount)),0);const priorSocial=priorDocs.reduce((s,d)=>Math.max(s,num(d.social)),0);const forecast=!winter?(prior||0):0;const forecastSocial=!winter?(priorSocial||0):0;return {bs,actual,actualSocial,winter,prior,priorSocial,forecast,forecastSocial,source:winter?'actual':prior?'prior-year':'none'}}
function forecast(docs,year){const sf=forecastSalaryTaxable(docs,year);if(!sf.sal.length)return null;const yearSalary=Object.values(sf.est).reduce((s,x)=>s+x.value,0);const actualMonths=sf.sal.map(d=>d.month).filter(m=>m>=1&&m<=12);const dec=sf.est[12];const payrollSocialActual=sf.sal.reduce((s,d)=>s+num(d.social),0);const socialBaseline=sf.sal.filter(d=>d.month>=4&&d.month<=9).map(d=>num(d.social));const socialFallback=sf.sal.map(d=>num(d.social));const socialBase=socialBaseline.length?socialBaseline:socialFallback;const socialAvg=socialBase.length?socialBase.reduce((a,b)=>a+b,0)/socialBase.length:0;const actualSocialMonths=new Set(sf.sal.map(d=>d.month));const salarySocialForecastMonths=[...Array(12)].map((_,i)=>i+1).filter(m=>!actualSocialMonths.has(m)).filter(m=>sf.est[m]?.source==='forecast');const salarySocial=payrollSocialActual+salarySocialForecastMonths.reduce((s)=>s+socialAvg,0);const bf=bonusForecast(docs,year);const bonusTotal=bf.actual+bf.forecast;const bonusSocialActual=bf.actualSocial;const bonusSocialForecast=bf.forecastSocial;const manual=manualFor(year);const tempTaxable=manual.temporaryTaxable?num(manual.temporary):0;const totalIncome=yearSalary+bonusTotal+tempTaxable;const life=calcLife(manual,year),earth=earthquakeDeduction(manual);const nationalPensionSelf=num(manual.nationalPension);const daughter=manual.daughterPensionEligible?num(manual.daughterNationalPension):0;const nationalPensionTotal=nationalPensionSelf+daughter;const ideco=num(manual.ideco);const manualDed=ideco+life.total+earth;const salaryDed=salaryDeduction(yearSalary);const salaryIncome=Math.max(0,yearSalary-salaryDed);const basic=basicDeduction(salaryIncome);const totalPayrollSocial=salarySocial+bonusSocialActual+bonusSocialForecast;const totalSocial=totalPayrollSocial+nationalPensionTotal;const taxable=Math.max(0,Math.floor((totalIncome-salaryDed-totalSocial-basic-manualDed)/1000)*1000);const rate=incomeTaxRate(taxable);const cap=Math.floor(2000+(taxable*.10*.20)/(0.90-rate*1.021));return {yearSalary,actualMonths:actualMonths.length,salaryEst:sf.est,baselineAverage:sf.baselineAverage,baselineMonths:sf.baselineMonths,dec:dec?.value,decSource:dec?.source,bonusTotal,bonusSource:bf.source,bonusActual:bf.actual,bonusForecast:bf.forecast,bonusSocialActual,bonusSocialForecast,manual,life,earth,nationalPensionSelf,daughter,nationalPensionTotal,ideco,manualDed,salaryDed,basic,salarySocial,bonusSocialActual,bonusSocialForecast,totalPayrollSocial,socialAvg,totalSocial,taxable,cap}}
function showMessage(msg,cls='ok'){const e=$('actionMessage');e.textContent=msg;e.className='message '+cls;setTimeout(()=>{if(e.textContent===msg)e.textContent=''},4000)}
function renderManual(){const years=[...new Set([...state.documents.map(d=>d.year),...Object.keys(state.manual).map(Number),2025,2024])].filter(Boolean).sort((a,b)=>b-a);const y=num($('manualYear')?.value)||years[0]||2025;if(!$('manualYear'))return; $('manualYear').innerHTML=years.map(v=>`<option value="${v}">${v}年</option>`).join('');$('manualYear').value=String(y);const m=manualFor(y);for(const id of ['newLife','oldLife','medical','newPension','oldPension','earthquake','oldLongTermDamage','ideco','nationalPension','daughterNationalPension','temporary'])$(id).value=m[id]??0;$('daughterPensionEligible').checked=m.daughterPensionEligible!==false;$('temporaryTaxable').checked=m.temporaryTaxable!==false;$('under23Dependent').checked=Boolean(m.under23Dependent);$('manualNote').value=m.note||'';updateManualCalc()}
function lifeFormula(premium,type,year,under23=false){const x=num(premium);if(!x)return '支払額 0円 → 控除額 0円';if(type==='newLife'&&year>=2026&&under23){if(x<=30000)return `${yen(x)}（30,000円以下）→ 全額 ${yen(x)}`;if(x<=60000)return `${yen(x)}×1/2＋15,000円＝${yen(x/2+15000)}（上限60,000円）`;if(x<=120000)return `${yen(x)}×1/4＋30,000円＝${yen(x/4+30000)}（上限60,000円）`;return `${yen(x)} → 上限60,000円`;}if(type==='old'){if(x<=25000)return `${yen(x)}（25,000円以下）→ 全額 ${yen(x)}`;if(x<=50000)return `${yen(x)}×1/2＋12,500円＝${yen(x/2+12500)}（上限50,000円）`;if(x<=100000)return `${yen(x)}×1/4＋25,000円＝${yen(x/4+25000)}（上限50,000円）`;return `${yen(x)} → 上限50,000円`;}if(x<=20000)return `${yen(x)}（20,000円以下）→ 全額 ${yen(x)}`;if(x<=40000)return `${yen(x)}×1/2＋10,000円＝${yen(x/2+10000)}（上限40,000円）`;if(x<=80000)return `${yen(x)}×1/4＋20,000円＝${yen(x/4+20000)}（上限40,000円）`;return `${yen(x)} → 上限40,000円`;}
function updateManualCalc(){const y=num($('manualYear').value),m={};for(const id of ['newLife','oldLife','medical','newPension','oldPension','earthquake','oldLongTermDamage','ideco','nationalPension','daughterNationalPension','temporary'])m[id]=num($(id).value);m.daughterPensionEligible=$('daughterPensionEligible').checked;m.temporaryTaxable=$('temporaryTaxable').checked;m.under23Dependent=$('under23Dependent').checked;const l=calcLife(m,y),e=earthquakeDeduction(m);const generalInput=lifeDeduction(m.newLife,'newLife',y,m.under23Dependent&&y>=2026)+lifeDeduction(m.oldLife,'old',y);const pensionInput=lifeDeduction(m.newPension,'new',y)+lifeDeduction(m.oldPension,'old',y);$('lifeBreakdown').innerHTML=`<div><b>① 一般生命保険料控除</b></div><div class="small">新契約：${lifeFormula(m.newLife,'newLife',y,m.under23Dependent&&y>=2026)}<br>旧契約：${lifeFormula(m.oldLife,'old',y)}<br>新旧を合算し、一般生命保険料控除は ${yen(l.general)}（この区分の上限 ${y>=2026&&m.under23Dependent?'60,000':'40,000'}円／旧契約のみの場合は50,000円）</div><div><b>② 介護医療保険料控除</b></div><div class="small">${lifeFormula(m.medical,'new',y)} → ${yen(l.medical)}（上限40,000円）</div><div><b>③ 個人年金保険料控除</b></div><div class="small">新契約：${lifeFormula(m.newPension,'new',y)}<br>旧契約：${lifeFormula(m.oldPension,'old',y)}<br>新旧を合算し、個人年金保険料控除は ${yen(l.pension)}（上限40,000円。旧契約のみの場合は50,000円）</div><div><b>④ 生命保険料控除 合計</b></div><div class="small">① ${yen(l.general)} ＋ ② ${yen(l.medical)} ＋ ③ ${yen(l.pension)} ＝ ${yen(l.general+l.medical+l.pension)} → <b>${yen(l.total)}</b>（3区分合計の上限120,000円）</div>`;$('earthquakeResult').innerHTML=`<b>⑤ 地震保険料控除</b><br>地震保険料 ${yen(m.earthquake)} → ${yen(Math.min(50000,m.earthquake))}（上限50,000円）<br>旧長期損害保険料 ${yen(m.oldLongTermDamage)} → ${yen(Math.min(15000,m.oldLongTermDamage))}（上限15,000円）<br>合計 ${yen(e)}`;$('manualSummary').innerHTML=`<b>⑥ iDeCo・小規模企業共済等掛金控除</b>：${yen(m.ideco)}（別枠）<br><b>⑦ 国民年金</b>：本人 ${yen(m.nationalPension)} ＋ 娘 ${m.daughterPensionEligible?'控除対象として算入':'控除対象に算入しない'} ${yen(m.daughterNationalPension)} ＝ ${yen(num(m.nationalPension)+(m.daughterPensionEligible?num(m.daughterNationalPension):0))}<br><span class="small">※国民年金は税法上は社会保険料控除ですが、このアプリではiDeCo等と混同しないよう別表示します。</span><br><b>⑧ 給与への追加・調整額</b>：${yen(m.temporary)}（${m.temporaryTaxable?'課税':'非課税'}）`;}
async function saveManual(){const y=num($('manualYear').value),m={};for(const id of ['newLife','oldLife','medical','newPension','oldPension','earthquake','oldLongTermDamage','ideco','nationalPension','daughterNationalPension','temporary'])m[id]=num($(id).value);m.daughterPensionEligible=$('daughterPensionEligible').checked;m.temporaryTaxable=$('temporaryTaxable').checked;m.under23Dependent=$('under23Dependent').checked;m.note=$('manualNote').value;state.manual[String(y)]=m;await putMeta('manual',state.manual);if($('calcYear'))$('calcYear').value=String(y);const log=addLog('手動入力保存',{year:y,manual:m});await putLog(log);state.logs=await allLogs();render();showMessage(`${y}年の手動入力を保存しました。${y}年の上限計算に反映済みです。`,'ok')}
function render(){const docs=state.documents.slice().sort((a,b)=>(a.year||0)-(b.year||0)||(a.month||0)-(b.month||0));const years=[...new Set(docs.map(d=>d.year).filter(Boolean))].sort((a,b)=>b-a);$('status').innerHTML=`<div class="grid"><div class="metric"><span>保存データ</span><b>${docs.length}</b></div><div class="metric"><span>給与</span><b>${docs.filter(d=>d.kind==='salary').length}</b></div><div class="metric"><span>賞与</span><b>${docs.filter(d=>d.kind==='bonus').length}</b></div><div class="metric"><span>源泉徴収票</span><b>${docs.filter(d=>d.kind==='withholding').length}</b></div><div class="metric"><span>確認必要</span><b>${docs.filter(d=>d.needsReview).length}</b></div></div>`;
 renderYearTables(docs);
 $('documents').innerHTML=docs.map(d=>`<details class="file"><summary><b>${d.year||'—'}/${d.month?String(d.month).padStart(2,'0')+' ':''}${d.name||d.document||'資料'}</b>　${d.needsReview?'<span class="warn">確認必要</span>':'<span class="ok">保存済み</span>'}</summary><div class="rawgrid"><div>種類</div><div>${d.kind}</div><div>課税対象額</div><div>${yen(d.taxable??d.taxableAmount)}</div><div>支給合計</div><div>${yen(d.totalPayment)}</div><div>非課税額</div><div>${yen(d.nonTaxable??d.nonTaxableAmount)}</div><div>社会保険料</div><div>${yen(d.social)}</div><div>所得税</div><div>${yen(d.incomeTax??d.withholdingTax)}</div><div>住民税</div><div>${yen(d.residentTax)}</div><div>追加支給</div><div>${yen(d.additional??d.additionalPaymentTotal)}</div></div><details><summary>読み取った全項目をJSONで確認</summary><pre>${escapeHtml(JSON.stringify(d,null,2))}</pre></details></details>`).join('')||'<p>まだデータがありません。</p>';
 const selectedYear=num($('calcYear')?.value)||years[0]||2025;if($('calcYear')){$('calcYear').innerHTML=[...new Set([...years,2025,2024])].sort((a,b)=>b-a).map(y=>`<option value="${y}">${y}年</option>`).join('');$('calcYear').value=String(selectedYear)}const f=forecast(docs,selectedYear);if(f){const salaryBreakdown=Object.entries(f.salaryEst).map(([m,x])=>`${m}月 ${yen(x.value)}【${x.source==='actual'?'実績':'予測'}】`).join(' ／ ');const actualSalaryMonths=Object.entries(f.salaryEst).filter(([,x])=>x.source==='actual').map(([m])=>m+'月').join('・')||'なし';const forecastSalaryMonths=Object.entries(f.salaryEst).filter(([,x])=>x.source==='forecast').map(([m])=>m+'月').join('・')||'なし';const payrollSocialForecastMonths=Object.entries(f.salaryEst).filter(([,x])=>x.source==='forecast').map(([m])=>m).join('・');const national=f.nationalPensionTotal;const deductionTotal=f.basic+f.totalPayrollSocial+national+f.ideco+f.life.total+f.earth;const taxableCheck=Math.max(0,f.yearSalary+f.bonusTotal+(f.manual.temporaryTaxable?num(f.manual.temporary):0)-f.salaryDed-deductionTotal);$('summary').innerHTML=`<div class="grid"><div class="metric"><span>給与年間（実績＋予測）</span><b>${yen(f.yearSalary)}</b></div><div class="metric"><span>賞与（実績＋予測）</span><b>${yen(f.bonusTotal)}</b></div><div class="metric"><span>上限概算</span><b>${yen(f.cap)}</b></div><div class="metric"><span>表示中の計算内訳</span><b>${selectedYear}年</b></div></div><div class="calcbox"><strong>${selectedYear}年 上限概算の計算内訳</strong><div>① 給与収入：${yen(f.yearSalary)}（実績 ${actualSalaryMonths} ／ 予測 ${forecastSalaryMonths}）</div><div>② 賞与：${yen(f.bonusActual)}【実績】 ＋ ${yen(f.bonusForecast)}【予測】 ＝ ${yen(f.bonusTotal)}</div><div>③ 給与所得控除：▲${yen(f.salaryDed)}</div><div>④ 社会保険料（給与＋賞与）：給与分 ${yen(f.salarySocial)} ＋ 賞与分 ${yen(f.bonusSocialActual+f.bonusSocialForecast)} ＝ ${yen(f.totalPayrollSocial)}（賞与予測分 ${yen(f.bonusSocialForecast)}）</div><div>⑤ 国民年金：本人 ${yen(f.nationalPensionSelf)} ＋ 娘 ${yen(f.daughter)} ＝ ${yen(national)}【入力】</div><div>⑥ iDeCo・小規模企業共済等掛金控除：${yen(f.ideco)}【入力】</div><div>⑦ 生命保険料控除：${yen(f.life.total)}【入力】</div><div>⑧ 地震保険料控除：${yen(f.earth)}【入力】</div><div>⑨ 基礎控除：${yen(f.basic)}</div><div><b>⑩ 所得控除合計</b>：④ ${yen(f.totalPayrollSocial)} ＋ ⑤ ${yen(national)} ＋ ⑥ ${yen(f.ideco)} ＋ ⑦ ${yen(f.life.total)} ＋ ⑧ ${yen(f.earth)} ＋ ⑨ ${yen(f.basic)} ＝ ${yen(deductionTotal)}</div><div>⑪ 課税所得の計算：総収入 ${yen(f.yearSalary+f.bonusTotal+(f.manual.temporaryTaxable?num(f.manual.temporary):0))} − ③給与所得控除 ${yen(f.salaryDed)} − ⑩所得控除合計 ${yen(deductionTotal)} ＝ ${yen(taxableCheck)}</div><div class="small">※上限概算に使う税額計算用の値は内部で1000円単位に丸めています。</div></div><div class="calcbox"><strong>実績・予測の区別</strong><div>【実績】資料から確認できた給与・賞与</div><div>【予測】未取得月の給与、未取得の冬賞与（前年冬賞与を使う場合を含む）</div><div>【入力】生命保険・地震・iDeCo・国民年金・調整額</div><div>【比較用・計算対象外】源泉徴収票は予測計算に入れず、年末の実績比較にのみ使用</div></div>`}else{$('summary').innerHTML='<p>この年度の給与データがありません。</p>'};
 $('details').innerHTML=docs.map(d=>`<div class="file"><b>${d.name||d.document||'資料'}</b><br>保存項目：${Object.keys(d).length}項目　／　計算使用：${d.kind==='salary'?'課税対象額・社会保険料・実績月':'賞与額・社会保険料等（計算段階に応じて）'}${d.kind==='withholding'?'／予測には不使用・比較用':''}</div>`).join('');renderManual();}
function esc(v){return escapeHtml(String(v??'—'))}
function fmtCell(v){return v==null||v===''?'—':(typeof v==='number'?Number(v).toLocaleString('ja-JP'):esc(v))}
function flattenReadFields(d){
 const rows=[];
 const push=(section,key,val)=>{if(val===undefined||val===null||val==='')return; if(typeof val==='object')return; rows.push({section,key,value:val});};
 const skip=new Set(['id','source','status','needsReview','missingFields','kind','type','name','document','year','month','payDate','payday','date','paymentItems','deductionItems','additionalPaymentItems','workingRecord','baseSalaryBreakdown','standardMonthlyRemuneration','standardBonusAmounts']);
 for(const [k,v] of Object.entries(d)) if(!skip.has(k)) push('基本情報',k,v);
 for(const [k,v] of Object.entries(d.paymentItems||{})) push('支給項目',k,v);
 for(const [k,v] of Object.entries(d.additionalPaymentItems||{})) push('追加支給',k,v);
 for(const [k,v] of Object.entries(d.deductionItems||{})) push('控除項目',k,v);
 for(const [k,v] of Object.entries(d.workingRecord||{})) push('勤務記録',k,v);
 for(const [k,v] of Object.entries(d.baseSalaryBreakdown||{})) push('給与内訳',k,v);
 for(const [k,v] of Object.entries(d.standardMonthlyRemuneration||{})) push('標準報酬',k,v);
 for(const [k,v] of Object.entries(d.standardBonusAmounts||{})) push('標準賞与',k,v);
 return rows;
}
function findItem(d,patterns){
 const all=[...(Object.entries(d.paymentItems||{})),...(Object.entries(d.additionalPaymentItems||{})),...(Object.entries(d.deductionItems||{}))];
 for(const [k,v] of all){if(patterns.some(p=>String(k).includes(p)))return v}
 return null;
}
function yearTable(year,docs){
 const groups=[['salary','給与'],['bonus','賞与'],['withholding','源泉徴収票'],['unknown','その他・未分類']];
 const renderGroup=(kind,label)=>{
  const rows=docs.filter(d=>d.kind===kind).slice().sort((a,b)=>(a.month||0)-(b.month||0)||(String(a.payDate||'').localeCompare(String(b.payDate||''))));
  if(!rows.length)return '';
  const main=rows.map(d=>{
   const stock=findItem(d,['持株会','持株補助','持株']);
   const stockSub=findItem(d,['持株補助']);
   return `<tr><td>${esc(d.month?`${d.month}月`:d.payDate||d.name||'—')}</td><td>${esc(d.name||d.document||'—')}</td><td>${fmtCell(d.taxable??d.taxableAmount)}</td><td>${fmtCell(d.totalPayment)}</td><td>${fmtCell(d.nonTaxable??d.nonTaxableAmount)}</td><td>${fmtCell(d.employment)}</td><td>${fmtCell(d.health)}</td><td>${fmtCell(d.healthSpecial)}</td><td>${fmtCell(d.care)}</td><td>${fmtCell(d.pension)}</td><td>${fmtCell(d.childSupport)}</td><td>${fmtCell(d.social)}</td><td>${fmtCell(d.incomeTax??d.withholdingTax)}</td><td>${fmtCell(d.residentTax)}</td><td>${fmtCell(d.additional??d.additionalPaymentTotal)}</td><td>${fmtCell(stock)}</td><td>${fmtCell(stockSub)}</td><td>${d.needsReview?'<span class="warn">要確認</span>':'<span class="ok">OK</span>'}</td></tr>`;
  }).join('');
  const allItems=rows.map(d=>{
   const fields=flattenReadFields(d);
   const missing=fields.filter(x=>x.value==null||x.value==='').length;
   return `<details class="read-detail"><summary>${esc(d.month?`${d.month}月`:d.payDate||d.name||'資料')}：${label}／読み取った項目 ${fields.length}項目${missing?'／空欄・未取得あり':''}</summary><div class="tablewrap"><table class="readtable full"><thead><tr><th>区分</th><th>項目名</th><th>読み取り値</th></tr></thead><tbody>${fields.map(x=>`<tr><td>${esc(x.section)}</td><td>${esc(x.key)}</td><td>${fmtCell(x.value)}</td></tr>`).join('')}</tbody></table></div><details><summary>原文テキストを確認</summary><pre>${escapeHtml(String(d.rawText||'原文保存なし'))}</pre></details></details>`;
  }).join('');
  const cols=kind==='withholding'?'支払金額／給与所得控除後／所得控除／源泉徴収税額など':kind==='bonus'?'賞与額／社会保険料各内訳／所得税／標準賞与額など':'課税対象額／支給合計／非課税額／社会保険各内訳／税／追加支給／持株会など';
  return `<h3>${label}（${rows.length}件）</h3><p class="small">${cols}</p><div class="tablewrap"><table class="readtable"><thead><tr><th>月/日</th><th>資料</th><th>課税対象額</th><th>支給合計</th><th>非課税額</th><th>雇用</th><th>健康</th><th>健康特定</th><th>介護</th><th>厚年</th><th>子育て支援</th><th>社会保険計</th><th>所得税</th><th>住民税</th><th>追加支給</th><th>持株会</th><th>持株補助</th><th>状態</th></tr></thead><tbody>${main}</tbody></table></div>${allItems}`;
 };
 return `<details class="yearblock" open><summary><strong>${year}年</strong>　給与・賞与・源泉徴収票を分離表示</summary>${groups.map(g=>renderGroup(g[0],g[1])).join('')}</details>`;
}
function kindLabel(k){return k==='salary'?'給与':k==='bonus'?'賞与':k==='withholding'?'源泉徴収票':k||'unknown'}
function renderYearTables(docs){
 const years=[...new Set(docs.map(d=>d.year).filter(Boolean))].sort((a,b)=>b-a);
 $('yearTables').innerHTML=years.length?years.map(y=>yearTable(y,docs.filter(d=>d.year===y))).join(''):'<p>まだ読み取り資料がありません。</p>';
}
function escapeHtml(s){return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
$('reflectJson').onclick=async()=>{try{await importJsonText($('jsonInput').value);$('jsonInput').value=''}catch(e){showMessage('反映できません：'+e.message,'error')}};
$('copyPrompt').onclick=async()=>{const prompt='ふるさと納税アプリへ反映して。Libraryの最新資料と既存データを比較し、重複を除外。給与明細・賞与明細・源泉徴収票は原文にある項目を省略せず、{"version":1,"documents":[...]}で全項目を返してください。源泉徴収票は予測に使わず、実績後の比較用に保存してください。';await navigator.clipboard.writeText(prompt);showMessage('ChatGPTへの依頼文をコピーしました。','ok')};
$('saveManual').onclick=saveManual;$('manualYear').onchange=renderManual;document.querySelectorAll('#manualForm input').forEach(e=>e.addEventListener('input',updateManualCalc));document.querySelectorAll('#manualForm input[type=checkbox]').forEach(e=>e.addEventListener('change',updateManualCalc));$('calcYear').onchange=render;
$('exportDb').onclick=()=>download('furusato_db.json',JSON.stringify({version:1,documents:state.documents,manual:state.manual},null,2));$('clearDb').onclick=async()=>{if(confirm('保存データと手動入力を消去しますか？')){const db=await openDB();await new Promise((res,rej)=>{const t=db.transaction([DOCS,LOGS,META],'readwrite');t.objectStore(DOCS).clear();t.objectStore(LOGS).clear();t.objectStore(META).clear();t.oncomplete=res;t.onerror=()=>rej(t.error)});state={documents:[],logs:[],manual:{}};render();showMessage('消去しました','ok')}};
function download(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
state.documents=await allDocs();state.logs=await allLogs();state.manual=await getMeta('manual')||{};
// Migrate old imported records. Classification is driven by the actual document name: Chinginmeisai=給与, Bonus=賞与, Gensen/Genseb=源泉徴収票.
const migrated=new Map();
for(const old of state.documents){
 const n=normalizeDoc(old,old.source||'migrated');
 const key=n.id;
 const prev=migrated.get(key);
 if(!prev || (prev.kind==='unknown' && n.kind!=='unknown')) migrated.set(key,n);
}
const oldIds=new Set(state.documents.map(d=>d.id));
for(const old of state.documents){if(!migrated.has(old.id)) await tx(DOCS,'readwrite',s=>s.delete(old.id));}
for(const n of migrated.values()) await putDoc(n);
state.documents=await allDocs();
// Remove legacy duplicate IDs after canonical reclassification.
const canonicalIds=new Set([...migrated.values()].map(d=>d.id));
for(const old of state.documents){if(old.id && !canonicalIds.has(old.id) && old.source==='migrated') await tx(DOCS,'readwrite',s=>s.delete(old.id));}
state.documents=await allDocs();render();
