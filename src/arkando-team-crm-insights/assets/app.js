/* ArkanDo Team CRM / Intake & Insights | no third-party charting dependency, no simulated business data. */
(() => {
  'use strict';
  const root = document.querySelector('#ark-crm-root');
  if (!root || !window.ARKANDO_CRM) return;
  const cfg = window.ARKANDO_CRM;
  const STAGES = {new:'ورودی تازه',needs_info:'اطلاعات ناقص',qualified:'ارزیابی‌شده',ready_call:'آماده تماس',contacting:'در حال تماس',follow_up:'نیازمند پیگیری',negotiating:'در مذاکره',transferred:'تحویل هسته تجاری',won:'موفق',lost:'ناموفق',archived:'بایگانی'};
  const ROLES = {buyer:'خریدار',supplier:'تأمین‌کننده',producer:'تولیدکننده',broker:'واسطه',logistics:'لجستیک',interested:'علاقه‌مند',service:'خدمات',unknown:'نامشخص'};
  const COMM = {unknown:'نامشخص',auto_sent:'ربات پاسخ داده',awaiting_reply:'منتظر پاسخ',replied:'پاسخ دریافت شد',contacted:'تماس برقرار شد',no_answer:'بدون پاسخ',do_not_contact:'عدم تماس'};
  const VALID = {unverified:'راستی‌آزمایی نشده',checking:'در حال بررسی',verified:'تأییدشده',rejected:'ردشده'};
  const PRIORITIES = ['P1','P2','P3'];
  const PALETTES = {arkando:['#C8A96B','#2E7391','#B68A4D','#2F8E83','#8766B7','#B66B5C','#538DAA','#729A63','#D1AC5F','#3D6C89','#A77795','#5CA7A5'],aurora:['#6366f1','#0ea5e9','#f97316','#10b981','#ec4899','#eab308','#8b5cf6','#14b8a6','#f43f5e','#84cc16','#06b6d4','#a855f7'],ocean:['#0284c7','#06b6d4','#14b8a6','#4f46e5','#8b5cf6','#38bdf8','#0f766e','#67e8f9','#818cf8','#22c55e','#0369a1','#7dd3fc'],sunset:['#f97316','#f43f5e','#eab308','#fb7185','#a855f7','#ef4444','#f59e0b','#db2777','#fca5a5','#ea580c','#d946ef','#fb923c'],violet:['#7c3aed','#a855f7','#4f46e5','#ec4899','#0ea5e9','#8b5cf6','#6366f1','#c084fc','#f472b6','#a78bfa','#818cf8','#14b8a6'],forest:['#059669','#84cc16','#0f766e','#65a30d','#0891b2','#22c55e','#14b8a6','#a3e635','#166534','#2dd4bf','#65a30d','#3b82f6'],candy:['#ec4899','#f59e0b','#8b5cf6','#f97316','#06b6d4','#d946ef','#ef4444','#10b981','#fbbf24','#7c3aed','#fb7185','#0ea5e9']};
  let color=PALETTES.arkando.slice();
  const esc = x => String(x??'').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num = x => Number(x||0).toLocaleString('fa-IR');
  const pct = (a,b) => b>0?Math.round(a*100/b):0;
  const pick = (obj,key) => obj?.[key] || 'نامشخص';
  const fmtDate = x => x ? new Date(String(x).replace(' ','T')).toLocaleDateString('fa-IR',{year:'numeric',month:'short',day:'numeric'}) : '—';
  const iso = date => {const d=new Date(date);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
  const today = () => { if(st?.boot?.server_date)return st.boot.server_date; const d=new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); };
  const labels = {...STAGES,...ROLES,...COMM,...VALID,P1:'بالا',P2:'متوسط',P3:'پایین',instagram:'اینستاگرام',whatsapp:'واتس‌اپ',website:'وب‌سایت',manual:'دستی',phone:'تلفن',none:'بدون مسئول'};
  const L = x => labels[x]||x||'نامشخص';
  // One-time migration: legacy Aurora was shipped as the brand preset by mistake.
  // Existing users start with ArkanDo once; subsequent explicit selections persist normally.
  // Preferences are optional: restricted storage or old invalid values must not block CRM access.
  const storage = {
    get(key){try{return localStorage.getItem(key);}catch(_){return null;}},
    set(key,value){try{localStorage.setItem(key,value);}catch(_){}},
    remove(key){try{localStorage.removeItem(key);}catch(_){}}
  };
  function storedList(key){try{const value=JSON.parse(storage.get(key)||'[]');return Array.isArray(value)?[...new Set(value.filter(x=>typeof x==='string'))]:[];}catch(_){return [];}}
  const themeKey='arkando-crm-theme';
  const themeMigration='arkando-crm-brand-default-v1';
  if(!storage.get(themeMigration)){
    storage.set(themeKey,'arkando');
    storage.set(themeMigration,'1');
  }
  const selectedTheme=storage.get(themeKey);
  const st = {tab:'dashboard',theme:Object.hasOwn(PALETTES,selectedTheme)?selectedTheme:'arkando',period:'all',filterOwner:'all',filterCampaign:'all',search:'',stage:'',boot:null,analytics:null,leads:[],total:0,leadPage:1,chartFilter:'all',leadEdit:0,notice:'',importResult:'',reassignResult:'',busy:false,staffSecret:null,pinned:storedList('arkando-crm-pins'),hidden:storedList('arkando-crm-hidden'),showHidden:false};
  async function api(path='',method='GET',data=undefined){
    const o={method,headers:{'X-WP-Nonce':cfg.nonce,'Accept':'application/json'},credentials:'same-origin'};
    if(data!==undefined){o.headers['Content-Type']='application/json';o.body=JSON.stringify(data);}
    o.cache='no-store';const res=await fetch(cfg.api+path,o);let payload={};try{payload=await res.json();}catch(_){throw new Error('پاسخ سرور قابل خواندن نیست');}
    if(!res.ok||payload.code){const error=new Error(payload.message||'خطای سرور');error.code=payload.code;error.status=res.status;throw error;}return payload;
  }
  function toast(msg){st.notice=msg;render();setTimeout(()=>{if(st.notice===msg){st.notice='';render();}},4500);}
  let dataRequest=0,bootRequest=0,leadRequest=0,importPreviewRequest=0,reassignPreviewRequest=0;
  const leadPath=()=> 'leads?per_page=100&page='+st.leadPage+'&search='+encodeURIComponent(st.search)+'&stage='+encodeURIComponent(st.stage);
  async function refresh(){
    const request=++bootRequest; ++dataRequest;
    try{
      st.busy=true;render();const boot=await api('bootstrap');if(request!==bootRequest)return;st.boot=boot;
      if(boot.password_change_required){st.analytics={rows:[],events:[],total:0};st.leads=[];st.total=0;st.busy=false;render();return;}
      await refreshData(true);if(request!==bootRequest)return;st.busy=false;render();
    }catch(e){if(request!==bootRequest)return;st.busy=false;root.innerHTML=`<div class="ark-error">${esc(e.message)} <button id="ark-retry">تلاش دوباره</button></div>`;root.querySelector('#ark-retry')?.addEventListener('click',refresh);}
  }
  async function refreshData(propagate=false){
    const request=++dataRequest;
    try{
      const [a,l]=await Promise.all([api('analytics'),api(leadPath())]);if(request!==dataRequest)return;
      st.analytics=a;st.leads=l.items||[];st.total=l.total||0;
      const lastPage=Math.max(1,Math.ceil(st.total/100));
      if(st.leadPage>lastPage){st.leadPage=lastPage;return refreshData(propagate);}
      render();
    }catch(e){if(request!==dataRequest)return;if(propagate)throw e;toast(e.message);}
  }
  function allRows(){return st.analytics?.rows||[];}
  function filtered(){let r=allRows();const t=today();const d=new Date(t+'T00:00:00');const days=st.period==='7'?7:st.period==='30'?30:st.period==='90'?90:0;
    if(days){d.setDate(d.getDate()-days+1);r=r.filter(x=>(x.created_at||'').slice(0,10)>=iso(d));}
    if(st.filterOwner!=='all')r=r.filter(x=>String(x.owner_id||0)===st.filterOwner);
    if(st.filterCampaign!=='all')r=r.filter(x=>String(x.opportunity_code||'')===st.filterCampaign);
    return r;
  }
  function group(rows,fn,limit=9){const m=new Map();for(const x of rows){let k=String(fn(x)||'نامشخص');m.set(k,(m.get(k)||0)+1);}return [...m].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([label,value])=>({label:L(label),raw:label,value}));}
  function groupSum(rows,labelFn,valueFn,limit=9){const m=new Map();for(const x of rows){let k=String(labelFn(x)||'نامشخص');m.set(k,(m.get(k)||0)+Number(valueFn(x)||0));}return [...m].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([label,value])=>({label:L(label),value}));}
  function seriesDate(rows,field='created_at',cum=false){const m=new Map();for(const x of rows){let d=(x[field]||'').slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(d))m.set(d,(m.get(d)||0)+1);}let n=0;return [...m].sort((a,b)=>a[0].localeCompare(b[0])).map(([label,value])=>({label,value:cum?(n+=value):value})).slice(-24);}
  function inPeriod(date){const days=Number(st.period)||0;if(!days)return true;const d=new Date(today()+'T00:00:00');d.setDate(d.getDate()-days+1);return date>=iso(d)&&date<=today();}
  function dailyEvents(name){const m=new Map();for(const x of st.analytics?.events||[]){if((!name||x.event_type===name)&&inPeriod(x.date))m.set(x.date,(m.get(x.date)||0)+Number(x.count||0));}return [...m].sort((a,b)=>a[0].localeCompare(b[0])).slice(-24).map(([label,value])=>({label,value}));}
  function bucket(n,limits,names){for(let i=0;i<limits.length;i++)if(n<=limits[i])return names[i];return names[names.length-1];}
  function groupsWithZero(rows,field,possible){const m=new Map(possible.map(k=>[k,0]));rows.forEach(x=>m.set(x[field]??'unknown',(m.get(x[field]??'unknown')||0)+1));return [...m].map(([label,value])=>({label:L(label),value}));}
  function progressAverage(rows,owner){const m=new Map(),ct=new Map();rows.forEach(x=>{const k=String(x[owner]||0);m.set(k,(m.get(k)||0)+Number(x.progress||0));ct.set(k,(ct.get(k)||0)+1);});return [...m].sort((a,b)=>b[1]/ct.get(b[0])-a[1]/ct.get(a[0])).slice(0,9).map(([label,value])=>({label:ownerName(label),value:Math.round(value/ct.get(label))}));}
  function ownerName(id){return (st.boot?.users||[]).find(u=>String(u.id)===String(id))?.name|| (Number(id)?'#'+id:'بدون مسئول');}
  function groupOwners(rows,field='owner_id'){return group(rows,x=>ownerName(x[field]||0),12);}
  function ageDays(date){if(!date)return 0;return Math.max(0,Math.floor((Date.parse(today()+'T00:00:00Z')-Date.parse(String(date).slice(0,10)+'T00:00:00Z'))/86400000));}
  function chartDefs(rows){const now=today();const open=x=>!['archived','won','lost','transferred'].includes(x.stage);const due=x=>x.due_at?.slice(0,10);
    const canonical=st.boot?.core_charts;
    const cRows=key=>(canonical[key]||[]).map(x=>({label:String(x.bucket||'نامشخص'),value:Number(x.value||0)}));
    const ds=key=>cRows(key).map(x=>({...x,label:L(x.label)}));
    const fromNested=(key,inner)=>(canonical[key]?.[inner]||[]).map(x=>({label:String(x.bucket||'نامشخص'),value:Number(x.value||0)}));
    const by=x=>group(rows,r=>r[x]);
    const stagesOpen=groupsWithZero(rows,'stage',Object.keys(STAGES));
    const dates=seriesDate(rows);
    const cs=[];const add=(id,title,desc,type,series,section='ورودی و پیگیری',extra={})=>cs.push({id,title,desc,type,series,section,...extra});
    add('trend','ورودی‌های روزانه','نوسان تعداد سرنخ‌های ثبت‌شده در هر روز','line',dates);
    add('cumulative','رشد تجمعی ورودی‌ها','روند انباشته‌ ثبت سرنخ‌های این دوره','area',seriesDate(rows,'created_at',true));
    add('stages','ترکیب مراحل پرونده','توزیع دقیق آخرین مرحله هر درخواست','donut',group(rows,x=>x.stage,Object.keys(STAGES).length));
    add('funnel','قیف پیشرفت عملیاتی','مسیر از ورودی تازه تا ارزیابی، تماس و انتقال','funnel',[
      {label:'ثبت‌شده',value:rows.length},{label:'دارای مسئول',value:rows.filter(x=>Number(x.owner_id)>0).length},
      {label:'واجد شرایط / آماده',value:rows.filter(x=>['qualified','ready_call','contacting','follow_up','negotiating','transferred','won'].includes(x.stage)).length},
      {label:'تماس ثبت‌شده',value:rows.filter(x=>Number(x.contact_attempts)>0).length},
      {label:'تحویل به هسته تجاری',value:rows.filter(x=>!!x.canonical_uuid).length}]);
    add('role','نوع نقش مخاطبان','تأمین‌کننده، خریدار، واسطه، تولیدکننده و ...','hbar',by('role_type'));
    add('channels','کانال ورود','منابع ورودی و راه‌های جذب مخاطب','donut',by('source_platform'));
    add('opp','تفکیک فرصت‌ها','تعداد متقاضیان در هر کد فرصت','bar',by('opportunity_code'));
    add('industry','صنایع فعال','تراکم سرنخ در حوزه‌های صنعتی','hbar',by('industry'));
    add('products','محصولات مورد درخواست','محصولاتی که بیشترین سرنخ را دارند','hbar',by('product'));
    add('comm','وضعیت مکاتبات','ربات، پاسخ، تماس موفق و عدم پاسخ','donut',by('comm_state'));
    add('verify','وضعیت اعتبارسنجی','ادعای اولیه از راستی‌آزمایی واقعی جداست','bar',by('verification'));
    add('priority','توزیع اولویت‌ها','اولویت P1 تا P3','donut',by('priority'));
    add('owners','حجم کار مسئولان','تعداد پرونده‌هایی که مسئول اصلی دارند','hbar',groupOwners(rows));
    add('backups','بار کاری جانشین‌ها','تعداد پرونده‌هایی که هر نفر جانشین است','hbar',groupOwners(rows.filter(x=>Number(x.backup_id)>0),'backup_id'));
    add('unassigned','تعیین تکلیف پرونده‌ها','با مسئول یا بدون مسئول','radial',[
      {label:'دارای مسئول',value:rows.filter(x=>Number(x.owner_id)>0).length},{label:'بدون مسئول',value:rows.filter(x=>!Number(x.owner_id)).length}]);
    add('nextAction','تکمیل اقدام بعدی','چند درصد درخواست‌های فعال اقدام بعدی دارند؟','radial',[
      {label:'دارای اقدام',value:rows.filter(x=>open(x)&&x.next_action).length},{label:'بدون اقدام',value:rows.filter(x=>open(x)&&!x.next_action).length}]);
    add('due','سلامت موعدها','موعد عقب‌افتاده، امروز، آینده، نامشخص','donut',group(rows.filter(open),x=>!due(x)?'بدون موعد':due(x)<now?'معوق':due(x)===now?'امروز':'آینده'));
    add('age','عمر پرونده‌ها','زمان سپری‌شده از ثبت اولیه','bar',group(rows,x=>bucket(ageDays(x.created_at),[1,3,7,14,30],['۰–۱ روز','۲–۳ روز','۴–۷ روز','۸–۱۴ روز','۱۵–۳۰ روز','بیشتر از ۳۰ روز'])));
    add('contact','تماس انسانی','دارای تلاش تماس در برابر بدون تماس','donut',group(rows,x=>Number(x.contact_attempts)>0?'تلاش تماس ثبت شده':'تماس ثبت نشده'));
    add('attempts','تعداد دفعات تماس','پرونده‌ها بر اساس تعداد تلاش تماس','bar',group(rows,x=>bucket(Number(x.contact_attempts||0),[0,1,2,4],['صفر','یک بار','دو بار','۳ یا ۴ بار','۵ بار یا بیشتر'])));
    add('score','درصد پیشرفت','بازه‌های درصد پیشرفت پرونده‌ها','bar',group(rows,x=>bucket(Number(x.progress||0),[0,25,50,75,99],['صفر','۱–۲۵٪','۲۶–۵۰٪','۵۱–۷۵٪','۷۶–۹۹٪','۱۰۰٪'])));
    add('avgProgress','میانگین پیشرفت مسئولان','پیشرفت ثبت‌شده توسط تیم، نه درآمد واقعی','hbar',progressAverage(rows,'owner_id'));
    add('weekday','روزهای هفته ورودی','ریتم هفتگی ثبت در CRM','bar',group(rows,x=>{const day=new Date((x.created_at||'').replace(' ','T')).getDay();return ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه','شنبه'][day]||'نامشخص';}));
    add('hour','ساعت‌های ثبت ورودی','الگوی ساعات ورود اطلاعات','bar',group(rows,x=>String(x.created_at||'').slice(11,13)+':00',14));
    add('month','ورودی ماهانه','رشد ثبت مخاطبان در ماه‌ها','bar',group(rows,x=>String(x.created_at||'').slice(0,7)));
    add('notes','تکمیل اطلاعات پیگیری','داشتن یا نداشتن اقدام بعدی','donut',group(rows,x=>x.next_action?'اقدام ثبت شده':'بدون اقدام'));
    add('campaigns','کمپین‌های مؤثر','حجم ورودی به تفکیک کمپین','hbar',by('campaign'));
    add('srcPost','پست‌های مبدأ','کدام منبع ورودی بیشتری ایجاد کرده است؟','hbar',group(rows,x=>x.source_ref||'نامشخص',7));
    add('handoff','نرخ اتصال به هسته تجاری','فقط دارای شناسه معتبر پرونده در هسته اصلی','radial',[
      {label:'متصل به پرونده مرکزی',value:rows.filter(x=>!!x.canonical_uuid).length},{label:'هنوز منتقل نشده',value:rows.filter(x=>!x.canonical_uuid).length}]);
    add('quality','کامل‌بودن داده‌ها','وجود محصول، کد فرصت و مسئول','bar',[
      {label:'محصول دارد',value:rows.filter(x=>x.product).length},{label:'فرصت مشخص',value:rows.filter(x=>x.opportunity_code).length},
      {label:'صنعت مشخص',value:rows.filter(x=>x.industry).length},{label:'مسئول مشخص',value:rows.filter(x=>Number(x.owner_id)>0).length},{label:'اقدام بعدی',value:rows.filter(x=>x.next_action).length}]);
    add('statusVsPriority','ماتریس مرحله × اولویت','نسبت مراحل به اولویت پرونده‌ها','heatmap',heatData(rows,x=>L(x.stage),x=>x.priority,8,3));
    add('ownerVsStage','ماتریس مسئول × مرحله','تقسیم کار واقعی بین اعضا و مراحل','heatmap',heatData(rows,x=>ownerName(x.owner_id),x=>L(x.stage),7,8));
    add('activity','فعالیت ثبت‌شده در طول زمان','رویدادهای کل CRM؛ مستقل از فیلتر مسئول و فرصت','area',dailyEvents());
    add('calltrend','روند تماس ثبت‌شده','تماس‌های کل CRM؛ مستقل از فیلتر مسئول و فرصت','line',dailyEvents('call'));
    add('outreach','روند پاسخ‌دهی دایرکت','پیام‌های کل CRM؛ مستقل از فیلتر مسئول و فرصت','line',dailyEvents('dm_sent'));
    if(st.boot?.manager&&canonical){
      add('coreCase','مراحل پرونده‌های تجاری مرکزی','خوانش مستقیم از هسته اصلی آرکاندو','bar',ds('case_pipeline'),'هسته معتبر تجاری');
      add('coreOpp','پیشرفت فرصت‌های مرکزی','مرحله فرصت‌های اصلی بدون کپی اطلاعات','donut',ds('opportunity_pipeline'),'هسته معتبر تجاری');
      add('coreNear','نزدیکی پرونده‌ها به معامله','بازه‌های امتیاز Near-Money در هسته','bar',ds('near_money_bands'),'هسته معتبر تجاری');
      add('coreOwner','توزیع پرونده‌های مرکزی','مسئول پرونده در هسته تجاری','hbar',ds('owner_workload').map(x=>({...x,label:ownerName(x.label)})),'هسته معتبر تجاری');
      add('coreRole','نقش تجاری معتبر در سیستم','طرف‌های BUYER / SUPPLIER مرکزی','donut',ds('commercial_roles'),'هسته معتبر تجاری');
      add('coreCountries','کشورهای تجاری ثبت‌شده','تفکیک جغرافیایی پرونده‌های اصلی','hbar',ds('geography'),'هسته معتبر تجاری');
      add('coreDiscovery','نقش سرنخ پژوهشی','سرنخ پژوهشی را با طرف تجاری تأییدشده یکی نکنید','donut',fromNested('discovery','roles'),'سرنخ پژوهشی');
      add('coreResearchGeo','کشورهای سرنخ‌های پژوهشی','مبدأ پژوهش‌های هنوز تأییدنشده','hbar',fromNested('discovery','geography'),'سرنخ پژوهشی');
      add('coreEvents','فعالیت هسته تجاری','روند رویدادهای رسمی هسته مرکزی','area',ds('event_trend'),'هسته معتبر تجاری');
      add('coreSources','آمادگی منابع','منابع آماده در برابر نیازمند پیش‌بررسی','donut',ds('source_readiness'),'هسته معتبر تجاری');
      add('coreQuality','کیفیت داده هسته','کیفیت ارزیابی‌شده توسط خود هسته','bar',ds('data_quality'),'هسته معتبر تجاری');
      add('coreProducts','محصولات پژوهش تجاری','محصولات از داده‌های پژوهشی مرکزی','hbar',fromNested('discovery','products'),'سرنخ پژوهشی');
    }
    return cs;
  }
  function heatData(rows,rFn,cFn,limitRows=8,limitCols=8){const rr=group(rows,rFn,limitRows).map(x=>x.label),cc=group(rows,cFn,limitCols).map(x=>x.label);
    return {r:rr,c:cc,values:rr.map(r=>cc.map(c=>rows.filter(x=>L(rFn(x))===r&&L(cFn(x))===c).length))};}
  const sep=n=>Math.round(n*100)/100;
  function svgBase(inner,view='0 0 600 220'){return `<svg class="ark-svg" viewBox="${view}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${inner}</svg>`;}
  function chartRender(def){const items=Array.isArray(def.series)?def.series.filter(x=>x&&Number.isFinite(Number(x.value))&&Number(x.value)>=0):[];
    if(def.type==='heatmap')return heatRender(def.series);
    if(!items.length||!items.some(x=>Number(x.value)>0))return '<div class="ark-empty"><span>◌</span>داده کافی برای این نمودار ثبت نشده است</div>';
    if(def.type==='donut'||def.type==='radial'){
      const total=items.reduce((a,x)=>a+Number(x.value),0);
      const slices=items.length>9?[...items.slice(0,8),{label:'سایر',value:items.slice(8).reduce((sum,item)=>sum+Number(item.value),0)}]:items;let circ=2*Math.PI*63,offset=0;
      let arcs=slices.map((x,i)=>{let seg=Number(x.value)/total*circ;const out=`<circle cx="115" cy="110" r="63" fill="none" stroke="${color[i%color.length]}" stroke-width="22" stroke-dasharray="${seg} ${circ-seg}" stroke-dashoffset="${-offset}" transform="rotate(-90 115 110)"/>`;offset+=seg;return out;}).join('');
      if(def.type==='radial')arcs=arcs.split('</circle>').join('</circle>');
      let center=def.type==='radial'?pct(items[0].value,total)+'٪':num(total);
      return `<div class="ark-chart-inline">${svgBase(`<circle cx="115" cy="110" r="63" fill="none" stroke="var(--cr-rail)" stroke-width="22"/>${arcs}<text x="115" y="110" class="svg-total" dominant-baseline="central" text-anchor="middle">${esc(center)}</text>`,'0 0 230 220')}<div class="ark-legend">${slices.map((x,i)=>`<div class="ark-leg"><i style="background:${color[i%color.length]}"></i><span title="${esc(x.label)}">${esc(x.label)}</span><b>${num(x.value)}</b></div>`).join('')}</div></div>`;
    }
    if(def.type==='line'||def.type==='area'){
      const m=Math.max(...items.map(x=>Number(x.value)),1),len=items.length,w=550,h=150;
      const pts=items.map((x,i)=>[28+(len<2?0:i/(len-1)*w),178-Number(x.value)/m*h]);
      const line=pts.map((x,i)=>(i?'L':'M')+sep(x[0])+','+sep(x[1])).join(' ');
      const fill=`${line} L${sep(pts[pts.length-1][0])},178 L${sep(pts[0][0])},178 Z`;
      const grid=[0,.25,.5,.75,1].map(f=>`<line x1="28" y1="${178-f*h}" x2="578" y2="${178-f*h}" stroke="var(--cr-grid)" stroke-width="1"/><text class="svg-axis" x="14" y="${182-f*h}">${num(Math.round(f*m))}</text>`).join('');
      return svgBase(`${grid}${def.type==='area'?`<path d="${fill}" fill="${color[0]}" opacity=".13"/>`:''}<path d="${line}" fill="none" stroke="${color[0]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${pts.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="3.8" fill="${color[i%color.length]}"><title>${esc(items[i].label)}: ${num(items[i].value)}</title></circle>`).join('')}<text x="28" y="211" class="svg-axis">${esc(items[0].label)}</text><text x="578" text-anchor="end" y="211" class="svg-axis">${esc(items[items.length-1].label)}</text>`);
    }
    if(def.type==='funnel'){
      const max=items[0].value||1;let parts='';items.forEach((x,i)=>{let width=50+Math.max(.08,Number(x.value)/max)*485;let half=width/2,y=8+i*42;parts+=`<polygon points="${300-half},${y} ${300+half},${y} ${300+half*.86},${y+37} ${300-half*.86},${y+37}" fill="${color[i%color.length]}" opacity=".9"><title>${esc(x.label)} ${num(x.value)}</title></polygon><text x="300" y="${y+24}" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${esc(x.label)} · ${num(x.value)}</text>`;});return svgBase(parts,'0 0 600 220');
    }
    if(def.type==='hbar'){
      const max=Math.max(...items.map(x=>Number(x.value)),1);
      return `<div class="ark-bars">${items.slice(0,9).map((x,i)=>`<div class="ark-bar-row"><div class="ark-bar-label"><span title="${esc(x.label)}">${esc(x.label)}</span><b>${num(x.value)}</b></div><div class="ark-bar-track"><div class="ark-bar-fill" style="width:${Math.max(1,100*x.value/max)}%;background:${color[i%color.length]}"></div></div></div>`).join('')}</div>`;
    }
    // categorical vertical bars
    const sample=items.slice(0,10),max=Math.max(...sample.map(x=>Number(x.value)),1),w=550,slot=w/sample.length,bw=Math.min(44,slot*.62);
    return svgBase(`<line x1="25" y1="176" x2="580" y2="176" stroke="var(--cr-grid)"/>${sample.map((x,i)=>{let h=148*x.value/max,center=28+i*slot+slot/2;return `<rect x="${center-bw/2}" y="${176-h}" width="${bw}" height="${h}" rx="7" fill="${color[i%color.length]}"><title>${esc(x.label)} · ${num(x.value)}</title></rect><text x="${center}" y="${168-h}" text-anchor="middle" class="svg-num">${num(x.value)}</text><text x="${center}" y="194" text-anchor="middle" class="svg-axis">${esc(String(x.label).slice(0,10))}</text>`;}).join('')}`);
  }
  function heatRender(data){if(!data?.r?.length||!data?.c?.length)return '<div class="ark-empty">داده کافی برای ماتریس وجود ندارد</div>';
    const max=Math.max(...data.values.flat(),1);return `<div class="ark-heat-scroll"><table class="ark-heat"><thead><tr><th></th>${data.c.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${data.r.map((r,i)=>`<tr><th>${esc(r)}</th>${data.c.map((c,j)=>`<td style="background:rgba(139,92,246,${sep(.08+.85*data.values[i][j]/max)})" title="${esc(r)} / ${esc(c)}">${num(data.values[i][j])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function kpis(rows){const now=today(),active=x=>!['archived','won','lost','transferred'].includes(x.stage);
    const overdue=rows.filter(x=>active(x)&&x.due_at&&x.due_at.slice(0,10)<now).length;
    const missing=rows.filter(x=>active(x)&&!Number(x.owner_id)).length;
    const missingNext=rows.filter(x=>active(x)&&!x.next_action).length;
    const linked=rows.filter(x=>!!x.canonical_uuid).length;
    return [{label:'کل ورودی‌های این دوره',value:rows.length,icon:'◈',tone:'violet'}, {label:'پرونده‌های بدون مسئول',value:missing,icon:'⚑',tone:'rose'},
      {label:'پیگیری عقب‌افتاده',value:overdue,icon:'◷',tone:'orange'}, {label:'بدون اقدام بعدی',value:missingNext,icon:'◇',tone:'amber'},
      {label:'تماس ثبت‌شده',value:rows.filter(x=>Number(x.contact_attempts)>0).length,icon:'☎',tone:'cyan'},
      {label:'تحویل به هسته تجاری',value:linked,icon:'↗',tone:'green'},
      {label:'میانگین پیشرفت',value:(rows.length?Math.round(rows.reduce((a,x)=>a+Number(x.progress||0),0)/rows.length):0)+'٪',icon:'◎',tone:'blue'},
      {label:'پرونده‌های فعال',value:rows.filter(active).length,icon:'▣',tone:'teal'}];
  }
  function selectOpts(object,value){return Object.entries(object).map(([k,v])=>`<option value="${esc(k)}" ${String(k)===String(value)?'selected':''}>${esc(v)}</option>`).join('');}
  function userSelect(value,includeUnassigned=true){return (includeUnassigned?'<option value="0">بدون مسئول</option>':'')+(st.boot?.users||[]).map(u=>`<option value="${u.id}" ${Number(value)===u.id?'selected':''}>${esc(u.name)}</option>`).join('');}
  const THEME_LABELS={arkando:'آرکاندو (رسمی)',aurora:'شفق',ocean:'اقیانوس',sunset:'غروب',violet:'بنفش',forest:'جنگل',candy:'انرژی'};
  function hNav(){return `<div class="ark-crm-hero"><div class="ark-brand"><span class="ark-symbol" role="img" aria-label="لوگوی آرکاندو"><img src="${esc(cfg.logo_url||'')}" alt="لوگوی اصلی آرکاندو" width="112" height="112" decoding="async" /></span><div><div class="ark-kicker">ARKANDO • OPERATIONS INTELLIGENCE</div><h1>مرکز فرماندهی آرکاندو</h1><p>آمار زنده، پرونده‌های مشترک و پیگیری تیمی</p></div></div><div class="ark-actions"><div class="ark-palette-block"><span>رنگ داشبورد</span><div class="ark-palette-list" role="group" aria-label="انتخاب رنگ داشبورد">${Object.entries(THEME_LABELS).map(([id,l])=>`<button type="button" class="ark-palette-chip ${st.theme===id?'selected':''}" data-theme-option="${id}" title="${l}" aria-label="${l}" aria-pressed="${st.theme===id}"><i class="ark-swatch swatch-${id}"></i></button>`).join('')}</div></div><button class="ark-btn ark-ghost" id="ark-refresh">↻ بروزرسانی</button><button class="ark-btn ark-main" id="ark-new">+ ثبت سریع سرنخ</button><a class="ark-btn ark-ghost ark-exit" href="${esc(cfg.portal_url||'/team-crm/')}">صفحه اصلی CRM</a></div></div><nav class="ark-nav">${[['dashboard','اتاق فرمان'],['charts','اطلس نمودارها'],['leads','مخاطبان و پیگیری'],['team','عملکرد تیم'],['settings','تیم و تنظیمات']].map(([id,title])=>`<button class="${st.tab===id?'active':''}" data-tab="${id}">${title}</button>`).join('')}</nav>`;}
  function filterBar(){const codes=['all',...new Set(allRows().map(x=>x.opportunity_code).filter(Boolean))];return `<div class="ark-filters"><label>دوره<select id="ark-period">${[['all','همه داده‌ها'],['7','۷ روز'],['30','۳۰ روز'],['90','۹۰ روز']].map(([v,l])=>`<option value="${v}" ${st.period===v?'selected':''}>${l}</option>`).join('')}</select></label><label>مسئول<select id="ark-owner"><option value="all">همه اعضا</option>${(st.boot?.users||[]).map(u=>`<option value="${u.id}" ${st.filterOwner===String(u.id)?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label><label>فرصت<select id="ark-campaign">${codes.map(x=>`<option value="${esc(x)}" ${st.filterCampaign===x?'selected':''}>${x==='all'?'همه فرصت‌ها':esc(x)}</option>`).join('')}</select></label><span class="ark-data-note">${st.analytics?.truncated?'⚠️ نمودارها فقط ۱۲هزار ورودی آخر را پوشش می‌دهند.':'● نمودارها از داده ثبت‌شده محاسبه می‌شوند.'}</span></div>`;}
  function dashboard(){const rows=filtered(),allCharts=chartDefs(rows);const top=allCharts.filter(x=>!st.hidden.includes(x.id)&&(st.pinned.includes(x.id)||['trend','funnel','stages','owners','due','opp','coreCase','coreNear','coreEvents','role','score','verify'].includes(x.id))).sort((a,b)=>Number(st.pinned.includes(b.id))-Number(st.pinned.includes(a.id)));
    return `${filterBar()}<div class="ark-kpi-grid">${kpis(rows).map(k=>`<article class="ark-kpi ${k.tone}"><div class="ark-kpi-icon">${k.icon}</div><div><span>${k.label}</span><strong>${typeof k.value==='number'?num(k.value):k.value}</strong></div></article>`).join('')}</div><div class="ark-section-heading"><div><small>EXECUTIVE OVERVIEW</small><h2>تصویر زنده عملیات</h2><p>نمودارهای پرونده با فیلترها محاسبه می‌شوند؛ نمودارهای فعالیت نمای کل CRM و هسته تجاری نمای کل هسته هستند.</p></div><button class="ark-link" data-tab="charts">مشاهده تمام ${num(allCharts.length)} نمودار ←</button></div><div class="ark-chart-grid">${top.map(chartCard).join('')}</div>`;}
  function chartCard(d){return `<article class="ark-chart-card"><header><div><div class="ark-chart-tag">${esc(d.section)}</div><h3>${esc(d.title)}</h3><p>${esc(d.desc)}</p></div><span class="ark-chart-head-actions"><button type="button" class="ark-card-action" data-pin="${esc(d.id)}" title="سنجاق‌کردن در ابتدای نمودارها">${st.pinned.includes(d.id)?'★':'☆'}</button><button type="button" class="ark-card-action" data-hide="${esc(d.id)}" title="نمایش/پنهان‌کردن نمودار">${st.hidden.includes(d.id)?'◉':'◌'}</button><span class="ark-chart-icon">${({donut:'◉',radial:'◎',line:'⌁',area:'∿',funnel:'▽',bar:'▥',hbar:'▤',heatmap:'▦'})[d.type]}</span></span></header><div class="ark-chart-canvas">${chartRender(d)}</div></article>`;}
  function charts(){const all=chartDefs(filtered());const groups=['all',...new Set(all.map(x=>x.section))];const visible=(st.chartFilter==='all'?all:all.filter(x=>x.section===st.chartFilter)).filter(x=>st.showHidden||!st.hidden.includes(x.id)).sort((a,b)=>Number(st.pinned.includes(b.id))-Number(st.pinned.includes(a.id)));
    return `${filterBar()}<div class="ark-section-heading"><div><small>ANALYTICS ATLAS</small><h2>${num(all.length)} نمودار مدیریتی مبتنی بر داده واقعی</h2><p>نمودارهای پرونده با همه فیلترها تغییر می‌کنند؛ فعالیت‌ها با دوره زمانی و هسته اصلی با کل موجودی رسمی نمایش داده می‌شوند.</p></div></div><div class="ark-chip-row">${groups.map(x=>`<button class="ark-chip ${st.chartFilter===x?'selected':''}" data-chart-filter="${esc(x)}">${x==='all'?'همه نمودارها':esc(x)}</button>`).join('')}<button class="ark-chip" id="ark-showhidden">${st.showHidden?'پنهان‌کردن نمودارهای مخفی':'نمایش نمودارهای مخفی'} (${num(st.hidden.length)})</button><button class="ark-chip" id="ark-reset-charts">بازنشانی چیدمان</button></div><div class="ark-chart-grid">${visible.map(chartCard).join('')}</div>`;}
  function leadTable(rows=st.leads){return `<div class="ark-table-overflow"><table class="ark-table"><thead><tr><th>مخاطب</th><th>شماره / اینستاگرام</th><th>فرصت و محصول</th><th>مرحله</th><th>مسئول</th><th>اقدام / موعد</th><th>پیشرفت</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.display_name||'بدون نام')}</b><small>${esc(L(x.role_type))}</small></td><td><span dir="ltr">${esc(x.phone_raw||'—')}</span><small dir="ltr">${esc(x.ig_username?'@'+x.ig_username:'')}</small></td><td>${esc(x.opportunity_code||'—')}<small>${esc(x.product||x.industry||'')}</small></td><td><span class="ark-status s-${esc(x.stage)}">${esc(L(x.stage))}</span></td><td>${esc(ownerName(x.owner_id))}</td><td>${esc(x.next_action||'—')}<small>${fmtDate(x.due_at)}</small></td><td><div class="ark-smallprogress"><div style="width:${Math.max(0,Math.min(100,Number(x.progress||0)))}%"></div></div><small>${num(x.progress)}٪</small></td><td><button class="ark-smallbutton" data-lead="${x.id}">پرونده ←</button></td></tr>`).join('')||'<tr><td colspan="8" class="ark-zero">هنوز پرونده‌ای در این نما نیست.</td></tr>'}</tbody></table></div>`;}
  function leads(){return `<div class="ark-section-heading"><div><small>SHARED INBOX</small><h2>مخاطبان و پیگیری‌های تیمی</h2><p>هر نفر یک پروفایل؛ هر فرصت یک پرونده پیگیری مستقل.</p></div><button class="ark-btn ark-main" id="ark-new2">+ ورودی جدید</button></div><div class="ark-list-controls"><input id="ark-search" placeholder="جست‌وجوی نام، شماره، آیدی، محصول یا فرصت" value="${esc(st.search)}"/><select id="ark-stage"><option value="">همه مراحل</option>${selectOpts(STAGES,st.stage)}</select><button class="ark-btn ark-ghost" id="ark-search-btn">جست‌وجو</button><div class="ark-total">${num(st.total)} پرونده</div></div>${leadTable()}<div class="ark-pager"><button id="ark-prev" ${st.leadPage<=1?'disabled':''}>صفحه قبل</button><span>صفحه ${num(st.leadPage)} از ${num(Math.max(1,Math.ceil(st.total/100)))}</span><button id="ark-next" ${st.leadPage>=Math.ceil(st.total/100)?'disabled':''}>صفحه بعد</button></div>`;}
  function team(){const rows=filtered(),u=st.boot?.users||[],team=u.map(o=>{const list=rows.filter(x=>Number(x.owner_id)===o.id),active=list.filter(x=>!['won','lost','archived','transferred'].includes(x.stage));return {...o,list,active};});
    return `${filterBar()}<div class="ark-section-heading"><div><small>TEAM PERFORMANCE</small><h2>کنترل پیشرفت و مسئولیت‌ها</h2><p>نقش‌ها در سطح سیستم قابل‌تغییرند؛ مسئول پرونده ثابت و کدنویسی‌شده نیست.</p></div></div><div class="ark-team-grid">${team.map(o=>`<article class="ark-team-card"><div class="ark-team-head"><span class="ark-avatar">${esc(o.name.slice(0,1))}</span><div><b>${esc(o.name)}</b><small>پرونده‌های واگذار شده</small></div></div><div class="ark-team-count">${num(o.list.length)} <small>کل پرونده</small></div><div class="ark-team-info"><span>فعال: ${num(o.active.length)}</span><span>نیازمند پیگیری: ${num(o.active.filter(x=>x.stage==='follow_up').length)}</span></div><div class="ark-smallprogress"><div style="width:${o.list.length?o.list.reduce((a,x)=>a+Number(x.progress||0),0)/o.list.length:0}%"></div></div><small>میانگین پیشرفت: ${num(o.list.length?Math.round(o.list.reduce((a,x)=>a+Number(x.progress||0),0)/o.list.length):0)}٪</small></article>`).join('')}</div><div class="ark-chart-grid">${chartDefs(rows).filter(x=>['owners','backups','avgProgress','ownerVsStage','due','unassigned'].includes(x.id)).map(chartCard).join('')}</div>`;}
  function staffPanel(){return `<div class="ark-settings-card ark-staff-card"><div class="ark-staff-card-title"><span class="ark-staff-mark">♙</span><div><h3>ایجاد حساب اعضای تیم</h3><p>ثبت‌نام عمومی وجود ندارد؛ مدیرعامل نام کاربری می‌سازد و رمز موقت را خصوصی به عضو می‌دهد. عضو در اولین ورود رمز را تغییر می‌دهد.</p></div></div><form id="ark-staff-form" class="ark-staff-form"><label>نام و نام خانوادگی<input name="display_name" required autocomplete="off"></label><label>نام کاربری انگلیسی<input name="username" dir="ltr" required minlength="3" maxlength="32" autocomplete="off"></label><label>ایمیل (اختیاری)<input type="email" name="email" dir="ltr" placeholder="در صورت وجود"></label><button class="ark-btn ark-main" type="submit" ${st.staffCreateBusy?'disabled':''}>+ ساخت حساب کارمند</button></form>${st.staffSecret?`<div class="ark-secret-result" role="status"><b>حساب ${esc(st.staffSecret.username)} ساخته یا بازنشانی شد</b><p>این رمز فقط اکنون برای مدیرعامل نمایش داده می‌شود. پس از تحویل خصوصی، آن را از صفحه پاک کنید.</p><code dir="ltr" id="ark-temp-password">${esc(st.staffSecret.temporary_password)}</code><button type="button" class="ark-smallbutton" id="ark-copy-secret">کپی نام کاربری و رمز</button><button type="button" class="ark-smallbutton" id="ark-clear-secret">پاک‌کردن رمز از صفحه</button></div>`:''}<p class="ark-staff-help">لینک ورود همه اعضا: <a href="${esc(cfg.portal_url)}" target="_blank" rel="noopener noreferrer">${esc(cfg.portal_url)}</a></p></div>`;}
  function passwordChangeScreen(){return `<div class="ark-crm-reset-shell"><div class="ark-crm-reset-card"><span class="ark-crm-login-mark"><img src="${esc(cfg.logo_url||'')}" alt="لوگوی اصلی آرکاندو" width="116" height="116" /></span><h1>تغییر رمز در اولین ورود</h1><p>برای امنیت اطلاعات مخاطبان، ابتدا باید رمز موقت حساب خود را تغییر دهید.</p><form id="ark-password-change"><label>رمز موقت فعلی<input type="password" name="current_password" required autocomplete="current-password" /></label><label>رمز جدید (حداقل ۱۲ نویسه شامل حروف لاتین و اعداد)<input type="password" name="new_password" required minlength="12" autocomplete="new-password" /></label><label>تکرار رمز جدید<input type="password" name="confirm_password" required autocomplete="new-password" /></label><button type="submit" class="ark-btn ark-main">ثبت رمز جدید</button><p id="ark-reset-message" role="status"></p></form></div></div>`;}
  function importReport(result){
    if(!result||typeof result==='string')return esc(result||'');
    const heading=result.preview?'پیش‌نمایش؛ هیچ اطلاعاتی تغییر نکرده است':'نتیجه ورود';
    const summary=`${heading}: ${num(result.created)} افزوده، ${num(result.skipped)} تکراری، ${num(result.review)} نیازمند بررسی، ${num(result.errors?.length)} خطا`;
    const errors=Array.isArray(result.errors)?result.errors:[];
    const details=errors.map(error=>{
      if(typeof error==='string')return `<li>${esc(error)}</li>`;
      return `<li>${error.row?`ردیف ${num(error.row)}: `:''}${esc(error.message||error.reason||error.error||JSON.stringify(error))}</li>`;
    }).join('');
    return `<p>${esc(result.fileName||'')} — ${esc(summary)}</p>${Number(result.review)>0?'<p class="ark-edit-conflict">بعضی ردیف‌ها نیازمند راستی‌آزمایی هستند؛ داده آرشیوی وضعیت تأییدشده یا تماس انجام‌شده محسوب نمی‌شود.</p>':''}${details?`<details open><summary>جزئیات خطاهای ردیف‌ها</summary><ul>${details}</ul></details>`:''}`;
  }
  function settings(){return `<div class="ark-section-heading"><div><small>SYSTEM CONTROL</small><h2>تنظیمات و ورود داده</h2><p>حساب‌های مستقل، کنترل مدیریت و انتقال امن آرشیو قبلی</p></div></div><div class="ark-settings-grid">${st.boot?.manager?staffPanel():''}<div class="ark-settings-card"><h3>دسترسی اعضا</h3><p>در این نسخه تعیین مسئول پرونده و تغییر مجوز دسترسی صرفاً با مدیرعامل است.</p>${st.boot?.manager?`<div class="ark-users">${(st.boot.all_users||[]).map(u=>`<div><span>${esc(u.name)} <small>شناسه ${u.id}</small></span><button class="ark-smallbutton" data-access="${u.id}" data-enabled="${u.enabled?1:0}" ${u.id===st.boot.me?'disabled':''}>${u.id===st.boot.me?'مدیرعامل':u.enabled?'لغو دسترسی CRM':'اعطای دسترسی CRM'}</button>${u.resettable?`<button class="ark-smallbutton" data-reset-staff="${u.id}" ${st.staffResetBusy?.[u.id]?'disabled':''}>رمز موقت جدید</button>`:''}</div>`).join('')}</div><p>برای ایجاد حساب جدید از «کاربران» وردپرس و نقش <code>ArkanDo CRM Operator</code> استفاده کنید. فعال‌کردن دسترسی در همین صفحه نیز ممکن است.</p>`:'<p>تغییر مجوزها فقط برای مدیرعامل فعال است.</p>'}</div><div class="ark-settings-card"><h3>واردکردن آرشیو اینستاگرام</h3><p>از فایل CSV آرشیو آرکاندو استفاده کنید؛ ورود دوباره همان شناسه، داده قبلی را بازنویسی نمی‌کند.</p>${st.boot?.manager?`<input type="file" accept=".csv,text/csv" id="ark-csv" ${st.importBusy?'disabled':''}/><button id="ark-preview-import" class="ark-btn ark-ghost" ${st.importBusy?'disabled':''}>پیش‌نمایش ورود</button> <button id="ark-import" class="ark-btn ark-main" ${!st.importPreview||st.importBusy?'disabled':''}>تأیید و ورود اطلاعات</button><div id="ark-import-result">${importReport(st.importResult)}</div>`:'<p>واردکردن گروهی فقط برای مدیرعامل مجاز است.</p>'}</div><div class="ark-settings-card"><h3>جابجایی دسته‌جمعی مسئولیت</h3><p>برای جایگزینی هر عضو تیم، تمام پرونده‌های فعال او بدون پاک‌شدن تاریخچه منتقل می‌شوند. پرونده‌های بسته/تجاری منتقل نمی‌شوند.</p>${st.boot?.manager?`<div class="ark-reassign"><label>از عضو<select id="ark-from" ${st.reassignBusy?'disabled':''}>${userSelect(st.reassignFrom||0)}</select></label><label>به عضو<select id="ark-to" ${st.reassignBusy?'disabled':''}>${userSelect(st.reassignTo||0)}</select></label></div><button class="ark-btn ark-ghost" id="ark-reassign-preview" ${st.reassignBusy?'disabled':''}>بررسی تعداد پرونده‌ها</button><button class="ark-btn ark-main" id="ark-reassign-apply" ${!st.reassignPreview||st.reassignBusy?'disabled':''}>تأیید انتقال</button><div id="ark-reassign-status">${esc(st.reassignResult)}</div>`:'<p>انتقال گروهی فقط برای مدیرعامل فعال است.</p>'}</div><div class="ark-settings-card"><h3>منبع اصلی اطلاعات تجاری</h3><p>پرونده معاملات، مشتریان تجاری احرازشده و سوابق مالی در هسته موجود ArkanDo Ontology OS باقی می‌مانند.</p><p>در اینجا فقط ورودی اولیه، ارجاع، تماس و تاریخچه پیگیری ثبت می‌شود. اتصال پرونده به هسته اصلی با شناسه UUID توسط مدیر ثبت می‌گردد.</p><b class="ark-safe">✓ عدم دست‌کاری مستقیم دیتابیس تجاری</b></div><div class="ark-settings-card"><h3>اطلاعات نسخه</h3><p>نسخه ${esc(st.boot?.version||'—')} — سطح دسترسی: ${st.boot?.manager?'مدیرعامل':'کاربر تیم'}</p><p>کل مخاطبان ثبت‌شده: ${num(st.analytics?.contacts)} | کل درخواست‌ها: ${num(st.analytics?.total)}</p><p>ورودی فعلی مستقل از آرشیو CSV است تا فایل قدیمی بدون آزمون وارد سیستم زنده نشود.</p></div></div>`;}
  function newModal(){return `<div class="ark-modal-bg" id="ark-modal-bg"><div class="ark-modal" role="dialog" aria-modal="true" aria-label="ثبت سرنخ"><header><h2>ثبت سریع ورودی</h2><button class="ark-icon-btn" data-close>×</button></header><form id="ark-create-form"><div class="ark-fields"><label>نام یا نام نمایشی<input name="display_name" placeholder="مثلاً محمد رضایی"/></label><label>آیدی اینستاگرام<input name="ig_username" dir="ltr" placeholder="@username"/></label><label>شماره / شماره‌ها<input name="phone_raw" dir="ltr" placeholder="0912..."/></label><label>شرکت<input name="company"/></label><label>فرصت<select name="opportunity_code"><option value="">نامشخص</option><option value="101">فرصت ۱۰۱</option><option value="102">فرصت ۱۰۲</option><option value="other">سایر</option></select></label><label>نقش فرد<select name="role_type">${selectOpts(ROLES,'unknown')}</select></label><label>محصول<input name="product" placeholder="مثلاً خرما، پرسلان"/></label><label>صنعت<input name="industry"/></label><label>منبع<input name="source_ref" placeholder="لینک یا شناسه پست"/></label>${st.boot?.manager?`<label>اولویت<select name="priority"><option value="P3">P3 عادی</option><option value="P2">P2 متوسط</option><option value="P1">P1 بالا</option></select></label>`:'<label>اولویت<input disabled value="P3 — تعیین با مدیرعامل"/></label>'}</div><label>خلاصه پیام<textarea name="notes" rows="3" placeholder="متن و واقعیت پیام، نه برداشت قطعی"></textarea></label><footer><button class="ark-btn ark-main" type="submit">ذخیره سرنخ</button><button class="ark-btn ark-ghost" type="button" data-close>انصراف</button></footer></form></div></div>`;}
  function leadModal(x){const manager=st.boot?.manager;return `<div class="ark-modal-bg" id="ark-modal-bg"><div class="ark-modal ark-modal-wide" role="dialog" aria-modal="true" aria-label="پرونده مخاطب"><header><div><small>پرونده #${x.id} • ${esc(x.external_key)}</small><h2>${esc(x.display_name||'مخاطب بدون نام')}</h2></div><button class="ark-icon-btn" data-close>×</button></header><div class="ark-contact-pills"><span dir="ltr">${esc(x.phone_raw||'بدون شماره')}</span><span dir="ltr">${esc(x.ig_username?'@'+x.ig_username:'بدون آیدی')}</span><span>${esc(x.product||'محصول نامشخص')}</span></div><form id="ark-edit-form"><input type="hidden" name="revision" value="${esc(x.revision||1)}"/><div class="ark-fields"><label>مرحله<select name="stage">${selectOpts(Object.fromEntries(Object.entries(STAGES).filter(([k])=>manager?(k!=='won'||x.stage===k):(!['negotiating','transferred','won','lost','archived'].includes(k)||x.stage===k))),x.stage)}</select></label><label>وضعیت پاسخ<select name="comm_state">${selectOpts(COMM,x.comm_state)}</select></label>${manager?`<label>اعتبارسنجی<select name="verification">${selectOpts(VALID,x.verification)}</select></label><label>اولویت<select name="priority">${PRIORITIES.map(p=>`<option ${p===x.priority?'selected':''}>${p}</option>`).join('')}</select></label>`:`<label>اعتبارسنجی <input disabled value="${esc(L(x.verification))}"/></label><label>اولویت <input disabled value="${esc(x.priority)}"/></label>`}<label>درصد پیشرفت<input type="number" name="progress" min="0" max="100" value="${esc(x.progress)}"/></label><label>موعد پیگیری<input type="datetime-local" ${manager?'':'disabled'} name="due_at" value="${esc(x.due_at?.slice(0,16).replace(' ','T')||'')}"/></label><label>اقدام بعدی<input name="next_action" ${manager?'':'disabled'} value="${esc(x.next_action)}"/></label>${manager?`<label>مسئول اصلی<select name="owner_id">${userSelect(x.owner_id)}</select></label><label>جانشین<select name="backup_id">${userSelect(x.backup_id)}</select></label><label>شناسه پرونده اصلی<input dir="ltr" name="canonical_uuid" value="${esc(x.canonical_uuid)}" placeholder="UUID هسته تجاری"/></label><label>کد فرصت<input name="opportunity_code" value="${esc(x.opportunity_code)}"/></label><label>محصول<input name="product" value="${esc(x.product)}"/></label><label>صنعت<input name="industry" value="${esc(x.industry)}"/></label>`:''}</div><label>یادداشت پرونده<textarea name="notes" rows="3">${esc(x.notes)}</textarea></label><footer><button type="submit" class="ark-btn ark-main">ثبت تغییرات</button></footer></form><div class="ark-activity"><h3>ثبت تماس یا رویداد واقعی</h3><form id="ark-event-form"><div class="ark-event-row"><select name="event_type"><option value="note">یادداشت</option><option value="call">تماس برقرار شد</option><option value="call_no_answer">تماس بی‌پاسخ</option><option value="dm_sent">پیام ارسال شد</option><option value="dm_received">پاسخ مخاطب آمد</option><option value="whatsapp">گفت‌وگوی واتس‌اپ</option><option value="handoff">تحویل اطلاعات</option><option value="document">دریافت مدرک</option></select><input name="summary" placeholder="نتیجه تماس یا متن فعالیت" required/><button class="ark-btn ark-ghost">ثبت رویداد</button></div></form><div id="ark-event-log" class="ark-event-log">در حال دریافت سوابق...</div></div></div></div>`;}
  function coreNotice(){return st.boot?.manager&&st.boot.core_charts==null?'<p class="ark-edit-conflict ark-core-unavailable" role="status">خوانش رسمی هسته تجاری در دسترس نیست؛ نمودارهای هسته فعلاً نمایش داده نمی‌شوند. ثبت و پیگیری CRM مستقل فعال است.</p>':'';}
  function render(){if(!st.boot){if(!root.querySelector('.ark-loading'))root.innerHTML='<div class="ark-loading">در حال خواندن CRM...</div>';return;}
    if(st.boot.password_change_required){root.innerHTML=passwordChangeScreen();bindPasswordChange();return;}
    color=(PALETTES[st.theme]||PALETTES.arkando).slice();root.setAttribute('data-theme',st.theme);root.parentElement?.setAttribute('data-theme',st.theme);
    root.innerHTML=`${hNav()}${st.notice?`<div class="ark-toast">${esc(st.notice)}</div>`:''}${st.busy?'<div class="ark-loading-mini">در حال بروزرسانی...</div>':''}<main class="ark-content">${coreNotice()}${({dashboard,charts,leads,team,settings})[st.tab]()}</main><footer class="ark-footer">ArkanDo • اطلاعات عملیاتی واقعی • حساب‌های مستقل • تغییرات ثبت‌شده • نسخه ${esc(st.boot.version)}</footer>`;
    bind();
  }
  const formState=form=>JSON.stringify([...new FormData(form)]);
  function closeModal(force=false){const bg=document.querySelector('#ark-modal-bg');return !bg||bg.arkClose(force);}
  function modal(html){
    closeModal(true);const origin=document.activeElement,previousOverflow=document.body.style.overflow;
    root.parentElement.insertAdjacentHTML('beforeend',html);const bg=document.getElementById('ark-modal-bg');
    const initial=[...bg.querySelectorAll('form')].map(form=>[form,formState(form)]);
    bg.arkDirty=()=>initial.some(([form,state])=>form.isConnected&&formState(form)!==state);
    const focusable=()=>[...bg.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')];
    const keydown=e=>{
      if(e.key==='Escape'){e.preventDefault();bg.arkClose();}
      if(e.key==='Tab'){const controls=focusable(),first=controls[0],last=controls.at(-1);if(!first)return;if(!controls.includes(document.activeElement)){e.preventDefault();(e.shiftKey?last:first).focus();}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    };
    bg.arkClose=(force=false)=>{
      if(!force&&bg.dataset.saving==='1')return false;
      if(!force&&bg.arkDirty()&&!confirm('تغییرات ذخیره‌نشده کنار گذاشته شوند؟'))return false;
      document.removeEventListener('keydown',keydown);bg.remove();root.inert=false;document.body.style.overflow=previousOverflow;
      if(origin?.isConnected)origin.focus();else root.querySelector('[data-tab].active')?.focus();return true;
    };
    bg.querySelectorAll('[data-close]').forEach(button=>button.setAttribute('aria-label','بستن پنجره'));
    document.addEventListener('keydown',keydown);bg.addEventListener('click',e=>{if(e.target===bg||e.target.closest('[data-close]'))bg.arkClose();});
    root.inert=true;document.body.style.overflow='hidden';focusable()[0]?.focus();return bg;
  }
  const WARNING_LABELS={shared_phone_review:'شماره مشترک یا هویت مبهم است؛ پیش از پیگیری، هویت مخاطب را بررسی کنید.',phone_unverified:'شماره واردشده قابل استانداردسازی نیست؛ مقدار اصلی حفظ شده و باید بررسی شود.',legacy_idempotency_unverified:'این شناسه مربوط به ثبت قدیمی است؛ تطابق کامل محتوای تکراری باید بررسی شود.'};
  const EVENT_LABELS={created:'ثبت پرونده',repeat_intake:'ورودی تکراری جدید',csv_import:'ورود آرشیو CSV',intake_received:'پیام ورودی تازه',updated:'ویرایش پرونده',assigned:'تعیین مسئول',reassigned:'انتقال مسئولیت',note:'یادداشت',call:'تماس برقرار شد',call_no_answer:'تماس بی‌پاسخ',dm_sent:'پیام ارسال شد',dm_received:'پاسخ مخاطب',whatsapp:'گفت‌وگوی واتس‌اپ',handoff:'تحویل اطلاعات',document:'دریافت مدرک',imported:'ورود آرشیو'};
  const FIELD_LABELS={stage:'مرحله',comm_state:'وضعیت پاسخ',progress:'پیشرفت',notes:'یادداشت',owner_id:'مسئول',backup_id:'جانشین',next_action:'اقدام بعدی',due_at:'موعد',verification:'اعتبارسنجی',priority:'اولویت',canonical_uuid:'شناسه هسته تجاری',opportunity_code:'فرصت',product:'محصول',industry:'صنعت',role_type:'نقش',campaign:'کمپین',source_ref:'منبع'};
  function eventChanges(value){
    let changes=value;if(typeof changes==='string'){try{changes=JSON.parse(changes);}catch(_){return '';}}
    if(!changes||typeof changes!=='object'||Array.isArray(changes))return '';
    return Object.entries(changes).filter(([key])=>Object.hasOwn(FIELD_LABELS,key)).map(([key,change])=>{
      const format=v=>key==='owner_id'||key==='backup_id'?ownerName(v):v===null||v===''?'—':L(String(v));
      if(change&&typeof change==='object'&&!Array.isArray(change)){
        const from=change.from??change.old??'',to=change.to??change.new??'';
        return `${FIELD_LABELS[key]}: ${format(from)} ← ${format(to)}`;
      }
      return `${FIELD_LABELS[key]}: ${format(change)}`;
    }).map(esc).join(' • ');
  }
  function historyEntry(ev){return `<article class="ark-event"><b>${esc(EVENT_LABELS[ev.event_type]||ev.event_type)}</b><small>${esc(ev.actor_name||ownerName(ev.actor_id))} • ${fmtDate(ev.occurred_at)} ${esc(String(ev.occurred_at||'').slice(11,16))}</small><p>${esc(WARNING_LABELS[ev.summary]||ev.summary||'')}</p>${eventChanges(ev.change_json)?`<p class="ark-event-changes">${eventChanges(ev.change_json)}</p>`:''}</article>`;}
  async function openLead(id){
    const request=++leadRequest,r=await api('leads?id='+encodeURIComponent(id));if(request!==leadRequest)return;
    const x=r.items?.[0];if(!x)return toast('پرونده پیدا نشد');const bg=modal(leadModal(x)),log=bg.querySelector('#ark-event-log'),edit=bg.querySelector('#ark-edit-form'),eventForm=bg.querySelector('#ark-event-form');
    const original=formState(edit);let cursor=null,historyBusy=false,historyRequest=0;
    const markEditStale=message=>{
      edit.dataset.stale='1';edit.querySelector('[type=submit]').textContent='بازخوانی پرونده برای ویرایش';
      if(!edit.querySelector('[data-edit-conflict]'))edit.insertAdjacentHTML('afterbegin',`<p class="ark-edit-conflict" data-edit-conflict role="status">${esc(message)}</p>`);
    };
    async function refreshEvents(append=false){
      if(append&&historyBusy)return;const history=++historyRequest;historyBusy=true;
      try{
        const result=await api('lead/'+id+'/events?per_page=50'+(append&&cursor?'&before_id='+encodeURIComponent(cursor):''));if(!bg.isConnected||history!==historyRequest)return;
        const more=log.querySelector('[data-history-more]'),restoreHistoryFocus=append&&document.activeElement===more,previousCount=append?log.querySelectorAll('.ark-event').length:0;
        if(!append)log.innerHTML='';more?.remove();
        const entries=result.items||[];log.insertAdjacentHTML('beforeend',entries.map(historyEntry).join(''));
        if(!log.children.length)log.textContent='هنوز فعالیتی ثبت نشده است.';
        cursor=result.next_before_id||null;
        if(cursor){log.insertAdjacentHTML('beforeend','<button type="button" class="ark-smallbutton" data-history-more>نمایش سوابق قدیمی‌تر</button>');log.querySelector('[data-history-more]').addEventListener('click',()=>refreshEvents(true).catch(e=>toast(e.message)));}
        if(restoreHistoryFocus){const target=log.querySelector('[data-history-more]')||log.querySelectorAll('.ark-event')[previousCount]||bg.querySelector('[data-close]');if(target){if(target.matches('.ark-event'))target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}}
      }finally{if(history===historyRequest)historyBusy=false;}
    }
    refreshEvents().catch(e=>log.textContent=e.message);
    const lock=busy=>{bg.dataset.saving=busy?'1':'0';bg.querySelectorAll('button[type=submit],#ark-event-form button').forEach(b=>b.disabled=busy);};
    edit.addEventListener('submit',async e=>{
      e.preventDefault();if(bg.dataset.saving==='1')return;
      if(edit.dataset.stale==='1'){if(confirm('برای بازخوانی آخرین نسخه، تغییرات ذخیره‌نشده کنار گذاشته شوند؟'))await openLead(id);return;}
      const data=Object.fromEntries(new FormData(edit));if(!data.due_at)data.due_at=null;else data.due_at=data.due_at.replace('T',' ')+':00';data.progress=Number(data.progress);data.revision=Number(data.revision);if(!st.boot.manager){delete data.due_at;delete data.next_action;}
      lock(true);try{await api('lead/'+id,'POST',data);if(bg.isConnected)bg.arkClose(true);toast('تغییرات ذخیره شد');await refreshData();}catch(err){if(err.code==='stale_revision'&&bg.isConnected)markEditStale('این پرونده هم‌زمان تغییر کرده است. متن نوشته‌شده شما حفظ شده؛ پیش از ذخیره، نسخه تازه را بازخوانی کنید.');toast(err.message);}finally{if(bg.isConnected)lock(false);}
    });
    eventForm.querySelector('[name=event_type]').setAttribute('aria-label','نوع فعالیت');eventForm.querySelector('[name=summary]').setAttribute('aria-label','شرح نتیجه فعالیت');
    eventForm.addEventListener('submit',async e=>{
      e.preventDefault();if(bg.dataset.saving==='1')return;
      const d=Object.fromEntries(new FormData(eventForm));d.idempotency_key=eventForm.dataset.eventKey||(eventForm.dataset.eventKey=crypto.randomUUID());
      lock(true);try{
        await api('lead/'+id+'/events','POST',d);delete eventForm.dataset.eventKey;eventForm.reset();
        if(bg.isConnected){
          if(formState(edit)===original){await openLead(id);}
          else{
            markEditStale('فعالیت ثبت شد و نسخه پرونده تغییر کرد. تغییرات نوشته‌شده شما حفظ شده‌اند؛ پیش از ذخیره باید آخرین نسخه را بازخوانی کنید.');
            await refreshEvents();
          }
        }
        await refreshData();
      }catch(err){toast(err.message);}finally{if(bg.isConnected)lock(false);}
    });
  }
  function bindPasswordChange(){root.querySelector('#ark-password-change')?.addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const target=root.querySelector('#ark-reset-message');if(d.new_password!==d.confirm_password){target.textContent='رمز جدید و تکرار آن برابر نیستند.';return;}if(!/[A-Za-z]/.test(d.new_password)||!/[0-9]/.test(d.new_password)){target.textContent='رمز باید شامل حرف لاتین و عدد باشد.';return;}target.textContent='در حال ثبت...';try{const r=await api('account/change-password','POST',d);target.textContent='رمز تغییر کرد. برای ورود مجدد به صفحه امن منتقل می‌شوید.';window.location.assign(r.login_url||cfg.login_url);}catch(err){target.textContent=err.message;}});}
  function bind(){root.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{st.tab=b.dataset.tab;render();}));
    root.querySelector('#ark-refresh')?.addEventListener('click',refresh);root.querySelector('#ark-new')?.addEventListener('click',showNew);root.querySelector('#ark-new2')?.addEventListener('click',showNew);
    root.querySelectorAll('[data-theme-option]').forEach(b=>b.addEventListener('click',()=>{st.theme=b.dataset.themeOption;storage.set('arkando-crm-theme',st.theme);render();}));
    for(const [id,k] of [['ark-period','period'],['ark-owner','filterOwner'],['ark-campaign','filterCampaign']])root.querySelector('#'+id)?.addEventListener('change',e=>{st[k]=e.target.value;render();});
    root.querySelectorAll('[data-chart-filter]').forEach(b=>b.addEventListener('click',()=>{st.chartFilter=b.dataset.chartFilter;render();}));
    root.querySelectorAll('[data-pin]').forEach(b=>b.addEventListener('click',()=>{let id=b.dataset.pin;st.pinned=st.pinned.includes(id)?st.pinned.filter(x=>x!==id):[...st.pinned,id];storage.set('arkando-crm-pins',JSON.stringify(st.pinned));render();}));
    root.querySelectorAll('[data-hide]').forEach(b=>b.addEventListener('click',()=>{let id=b.dataset.hide;st.hidden=st.hidden.includes(id)?st.hidden.filter(x=>x!==id):[...st.hidden,id];storage.set('arkando-crm-hidden',JSON.stringify(st.hidden));render();}));
    root.querySelector('#ark-showhidden')?.addEventListener('click',()=>{st.showHidden=!st.showHidden;render();});
    root.querySelector('#ark-reset-charts')?.addEventListener('click',()=>{st.pinned=[];st.hidden=[];st.showHidden=false;storage.remove('arkando-crm-pins');storage.remove('arkando-crm-hidden');render();});
    root.querySelectorAll('[data-lead]').forEach(b=>b.addEventListener('click',()=>openLead(b.dataset.lead).catch(e=>toast(e.message))));
    root.querySelector('#ark-stage')?.addEventListener('change',e=>{st.stage=e.target.value;st.leadPage=1;refreshData();});
    root.querySelector('#ark-search')?.addEventListener('keydown',e=>{if(e.key==='Enter'){st.search=e.target.value;st.leadPage=1;refreshData();}});
    root.querySelector('#ark-search-btn')?.addEventListener('click',()=>{st.search=root.querySelector('#ark-search')?.value||'';st.leadPage=1;refreshData();});
    root.querySelector('#ark-prev')?.addEventListener('click',()=>{st.leadPage--;refreshData();});root.querySelector('#ark-next')?.addEventListener('click',()=>{st.leadPage++;refreshData();});
    root.querySelectorAll('[data-access]').forEach(b=>b.addEventListener('click',async()=>{try{await api('settings','POST',{user_id:Number(b.dataset.access),enabled:b.dataset.enabled!=='1'});toast('مجوز دسترسی به‌روز شد.');await refresh();}catch(e){toast(e.message);}}));
    root.querySelector('#ark-staff-form')?.addEventListener('submit',async e=>{e.preventDefault();if(st.staffCreateBusy)return;st.staffCreateBusy=true;const form=e.target;const data=Object.fromEntries(new FormData(form));const btn=form.querySelector('button[type=submit]');btn.disabled=true;try{const result=await api('staff','POST',data);st.staffSecret={username:result.username,temporary_password:result.temporary_password};await refresh();st.tab='settings';render();}catch(err){toast(err.message);}finally{st.staffCreateBusy=false;const current=root.querySelector('#ark-staff-form button[type=submit]');if(current)current.disabled=false;}});
    root.querySelectorAll('[data-reset-staff]').forEach(b=>b.addEventListener('click',async()=>{const id=b.dataset.resetStaff;st.staffResetBusy??={};if(st.staffResetBusy[id])return;if(!confirm('برای این کارمند رمز موقت جدید ساخته شود؟ رمز قبلی باطل خواهد شد.'))return;st.staffResetBusy[id]=true;b.disabled=true;try{const r=await api('staff/'+id+'/reset','POST',{});st.staffSecret={username:r.username,temporary_password:r.temporary_password};render();}catch(e){toast(e.message);}finally{delete st.staffResetBusy[id];root.querySelectorAll('[data-reset-staff]').forEach(button=>{if(button.dataset.resetStaff===id)button.disabled=false;});}}));
    root.querySelector('#ark-clear-secret')?.addEventListener('click',()=>{st.staffSecret=null;render();});
    root.querySelector('#ark-copy-secret')?.addEventListener('click',async()=>{if(!st.staffSecret)return;const x=`${cfg.portal_url}\nنام کاربری: ${st.staffSecret.username}\nرمز موقت: ${st.staffSecret.temporary_password}\nدر اولین ورود رمز را تغییر بدهید.`;try{await navigator.clipboard.writeText(x);toast('مشخصات برای تحویل خصوصی کپی شد.');}catch(_){toast('کپی خودکار ممکن نیست؛ متن را انتخاب و کپی کنید.');}});
    const updateReassignControls=()=>{
      ['ark-from','ark-to','ark-reassign-preview'].forEach(id=>{const el=root.querySelector('#'+id);if(el)el.disabled=!!st.reassignBusy;});
      const apply=root.querySelector('#ark-reassign-apply');if(apply)apply.disabled=!!st.reassignBusy||!st.reassignPreview;
      const out=root.querySelector('#ark-reassign-status');if(out)out.textContent=st.reassignResult;
    };
    ['ark-from','ark-to'].forEach(id=>root.querySelector('#'+id)?.addEventListener('change',e=>{
      if(st.reassignBusy)return;st[id==='ark-from'?'reassignFrom':'reassignTo']=Number(e.target.value);++reassignPreviewRequest;delete st.reassignPreview;st.reassignResult='انتخاب تغییر کرد؛ تعداد پرونده‌ها را دوباره بررسی کنید.';updateReassignControls();
    }));
    root.querySelector('#ark-reassign-preview')?.addEventListener('click',async()=>{
      if(st.reassignBusy)return;const request=++reassignPreviewRequest,from=Number(st.reassignFrom||0),to=Number(st.reassignTo||0);delete st.reassignPreview;updateReassignControls();
      try{
        const r=await api('reassign','POST',{from_id:from,to_id:to,mode:'preview'});
        if(request!==reassignPreviewRequest||from!==Number(st.reassignFrom||0)||to!==Number(st.reassignTo||0))return;
        st.reassignPreview=r.count>0?{from,to}:null;st.reassignResult=`${num(r.count)} پرونده فعال قابل انتقال است؛ هنوز هیچ تغییری اعمال نشده.`;updateReassignControls();
      }catch(e){if(request===reassignPreviewRequest)toast(e.message);}
    });
    root.querySelector('#ark-reassign-apply')?.addEventListener('click',async()=>{
      if(st.reassignBusy||!st.reassignPreview)return;const {from,to}=st.reassignPreview;
      if(from!==Number(st.reassignFrom||0)||to!==Number(st.reassignTo||0))return;
      st.reassignBusy=true;delete st.reassignPreview;updateReassignControls();
      try{const r=await api('reassign','POST',{from_id:from,to_id:to,mode:'apply'});st.reassignResult=`${num(r.updated)} پرونده منتقل شد؛ ${num(r.failed?.length)} خطا. تاریخچه هر انتقال ثبت شد.`;delete st.reassignPreview;await refreshData();}
      catch(e){toast(e.message);}finally{st.reassignBusy=false;updateReassignControls();}
    });
    const updateImportControls=()=>{
      const file=root.querySelector('#ark-csv'),preview=root.querySelector('#ark-preview-import'),apply=root.querySelector('#ark-import'),out=root.querySelector('#ark-import-result');
      if(file)file.disabled=!!st.importBusy;if(preview)preview.disabled=!!st.importBusy;
      if(apply){apply.disabled=!!st.importBusy||!st.importPreview;apply.textContent=st.importBusy?'در حال ورود امن...':'تأیید و ورود اطلاعات';}
      if(out)out.innerHTML=importReport(st.importResult);
    };
    root.querySelector('#ark-csv')?.addEventListener('change',()=>{++importPreviewRequest;delete st.importPreview;st.importResult='';updateImportControls();});
    root.querySelector('#ark-preview-import')?.addEventListener('click',async()=>{
      if(st.importBusy)return;const f=root.querySelector('#ark-csv')?.files?.[0];if(!f)return toast('ابتدا فایل CSV را انتخاب کنید.');if(f.size>2000000)return toast('حداکثر حجم CSV دو مگابایت است.');
      const request=++importPreviewRequest;delete st.importPreview;updateImportControls();
      try{
        const csv=await f.text(),result=await api('import','POST',{csv,dry_run:true});
        if(request!==importPreviewRequest||root.querySelector('#ark-csv')?.files?.[0]!==f)return;
        if(!result.errors?.length)st.importPreview={csv,sha:result.file_sha256,fileName:f.name};
        st.importResult={...result,fileName:f.name,preview:true};updateImportControls();
      }catch(e){if(request===importPreviewRequest)toast(e.message);}
    });
    root.querySelector('#ark-import')?.addEventListener('click',async()=>{
      if(st.importBusy)return;if(!st.importPreview)return toast('ابتدا پیش‌نمایش ورود را انجام دهید.');
      const preview=st.importPreview;st.importBusy=true;++importPreviewRequest;updateImportControls();
      try{
        const result=await api('import','POST',{csv:preview.csv});st.importResult={...result,fileName:preview.fileName,preview:false};delete st.importPreview;await refreshData();
      }catch(e){toast(e.message);}finally{st.importBusy=false;updateImportControls();}
    });
  }
  function showNew(){
    const bg=modal(newModal()),form=bg.querySelector('#ark-create-form');
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(bg.dataset.saving==='1')return;
      const data=Object.fromEntries(new FormData(form));data.external_key=form.dataset.createKey||(form.dataset.createKey='manual:'+crypto.randomUUID());
      const button=form.querySelector('[type=submit]');button.disabled=true;bg.dataset.saving='1';
      try{const result=await api('lead','POST',data);if(bg.isConnected)bg.arkClose(true);toast((result.created?'مخاطب و درخواست ثبت شد.':'پرونده قبلی یافت شد؛ تکراری ایجاد نشد.')+(result.warning?' '+(WARNING_LABELS[result.warning]||'این ثبت نیازمند بررسی اطلاعات است.') :''));await refreshData();}
      catch(err){toast(err.message);}finally{if(bg.isConnected){bg.dataset.saving='0';button.disabled=false;}}
    });
  }
  refresh();
})();
