(() => {
  const cfg = window.DENTAL_CONFIG || {};
  const configured = cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('PEGA_AQUI') && !cfg.supabaseAnonKey.includes('PEGA_AQUI');
  const $ = id => document.getElementById(id);
  let client = null, channel = null, patients = [], payments = [], clinics = [], clinicTableAvailable = true;
  let selectedClinic = '__all__', warnedClinicTable = false;
  const money = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(Number(n)||0);
  const date = s => s ? new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(s)) : '—';
  const safe = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function toast(s){$('toast').textContent=s;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),3000)}
  function msg(s){$('loginMessage').textContent=s}
  function connection(ok,label){$('connectionDot').classList.toggle('ok',!!ok);$('connectionText').textContent=label}
  function showApp(){ $('loginView').classList.add('hidden');$('appView').classList.remove('hidden');$('todayLabel').textContent=new Intl.DateTimeFormat('es-MX',{dateStyle:'medium'}).format(new Date()); }
  function logout(){if(channel&&client)client.removeChannel(channel);channel=null;patients=[];payments=[];clinics=[];$('appView').classList.add('hidden');$('loginView').classList.remove('hidden');if(client)client.auth.signOut();}
  function goto(page){document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$(page+'Page').classList.remove('hidden');document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('pageTitle').textContent=({overview:'Resumen general',patients:'Pacientes',payments:'Cobranza',clinics:'Clínicas'})[page]||'DENTAL JG';}
  function nameFor(id){return patients.find(p=>p.id===id)?.name||'Paciente';}
  function clinicForPayment(p){const patient=patients.find(x=>x.id===p.patient_id);return String(patient?.clinic||p.clinic||'').trim();}
  function clinicMatches(name){return selectedClinic==='__all__'||String(name||'').trim()===selectedClinic;}
  function filteredPatients(){return patients.filter(p=>clinicMatches(p.clinic));}
  function filteredPayments(){return payments.filter(p=>clinicMatches(clinicForPayment(p)));}
  function renderClinicControls(){
    const filter=$('clinicFilter');if(!filter)return;
    const names=[...new Set([...clinics.map(c=>c.name),...patients.map(p=>String(p.clinic||'').trim()).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'es'));
    filter.innerHTML='<option value="__all__">Todas las clínicas</option>'+names.map(n=>`<option value="${safe(n)}">${safe(n)}</option>`).join('');
    if(selectedClinic!=='__all__'&&!names.includes(selectedClinic))selectedClinic='__all__';filter.value=selectedClinic;
  }
  function renderClinics(){
    const names=[...new Set([...clinics.map(c=>c.name),...patients.map(p=>String(p.clinic||'').trim()).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'es'));
    $('clinicCount').textContent=`${names.length} ${names.length===1?'clínica':'clínicas'}`;
    $('clinicRows').innerHTML=names.length?names.map(n=>{const count=patients.filter(p=>String(p.clinic||'').trim()===n).length;return `<tr><td><span class="clinic-tag">${safe(n)}</span></td><td>${count}</td><td><button class="small-action" data-select-clinic="${safe(n)}" type="button">Ver esta clínica</button></td></tr>`}).join(''):'<tr><td colspan="3" class="empty">Todavía no hay clínicas. Agrega la primera arriba.</td></tr>';
    document.querySelectorAll('[data-select-clinic]').forEach(b=>b.addEventListener('click',()=>{selectedClinic=b.dataset.selectClinic;renderClinicControls();render();goto('overview');toast('Filtro aplicado: '+selectedClinic)}));
  }
  function render(){
    renderClinicControls();
    const visiblePatients=filteredPatients(), visiblePayments=filteredPayments();
    const paid = visiblePatients.filter(p=>Number(p.total||0)-Number(p.paid||0)<=0).length;
    const collected = visiblePayments.reduce((s,p)=>s+Number(p.amount||0),0);
    const pending = visiblePatients.reduce((s,p)=>s+Math.max(0,Number(p.total||0)-Number(p.paid||0)),0);
    $('metricPatients').textContent=visiblePatients.length.toLocaleString('es-MX');$('metricCollected').textContent=money(collected);$('metricPending').textContent=money(pending);$('metricPaid').textContent=paid.toLocaleString('es-MX');
    const recent=[...visiblePayments].sort((a,b)=>new Date(b.paid_at||b.created_at)-new Date(a.paid_at||a.created_at)).slice(0,7);
    $('recentRows').innerHTML=recent.length?recent.map(p=>`<tr><td>${safe(p.patient_name||nameFor(p.patient_id))}</td><td><span class="pill">Pago registrado</span></td><td>${safe(date(p.paid_at||p.created_at))}</td><td class="money">${money(p.amount)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">Todavía no hay pagos registrados para esta selección.</td></tr>';
    const term=($('patientSearch')?.value||'').toLowerCase();const list=visiblePatients.filter(p=>[p.name,p.phone,p.clinic,p.policy_number].some(x=>String(x||'').toLowerCase().includes(term)));
    $('patientRows').innerHTML=list.length?list.map(p=>`<tr><td>${safe(p.name)}</td><td>${safe(p.phone||'—')}</td><td>${safe(p.clinic||'—')}</td><td>${safe(p.policy_number||'—')}</td><td>${money(p.total)}</td><td>${money(p.paid)}</td><td class="money">${money(Math.max(0,Number(p.total||0)-Number(p.paid||0)))}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">No se encontraron pacientes para esta selección.</td></tr>';
    const pt=($('paymentSearch')?.value||'').toLowerCase();const plist=[...visiblePayments].filter(p=>String(p.patient_name||nameFor(p.patient_id)).toLowerCase().includes(pt)).sort((a,b)=>new Date(b.paid_at||b.created_at)-new Date(a.paid_at||a.created_at));
    $('paymentRows').innerHTML=plist.length?plist.map(p=>`<tr><td>${safe(p.patient_name||nameFor(p.patient_id))}</td><td>${safe(date(p.paid_at||p.created_at))}</td><td>${safe(p.concept||'Abono')}</td><td class="money">${money(p.amount)}</td><td>${safe(p.reference||'—')}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">Todavía no hay pagos registrados para esta selección.</td></tr>';
    renderClinics();
  }
  async function load(){
    if(!client)return;
    connection(false,'Actualizando…');
    const [pr,pa,cr]=await Promise.all([
      client.from('patients').select('*').order('created_at',{ascending:false}),
      client.from('payments').select('*').order('paid_at',{ascending:false}),
      client.from('clinics').select('*').order('name',{ascending:true})
    ]);
    if(pr.error||pa.error){connection(false,'Error de conexión');toast('No se pudieron leer los datos. Revisa tablas y permisos.');console.error(pr.error,pa.error);return;}
    patients=pr.data||[];payments=pa.data||[];
    clinicTableAvailable=!cr.error;clinics=cr.error?[]:(cr.data||[]);
    if(cr.error&&!warnedClinicTable){warnedClinicTable=true;toast('Falta crear la tabla de clínicas: ejecuta el SQL incluido en el ZIP.');console.warn('No se pudo leer clinics; ejecuta supabase_schema.sql',cr.error);}
    render();connection(true,'En línea · tiempo real');
  }
  function realtime(){
    if(channel)client.removeChannel(channel);
    channel=client.channel('dental-jg-live').on('postgres_changes',{event:'*',schema:'public',table:'patients'},load).on('postgres_changes',{event:'*',schema:'public',table:'payments'},load).on('postgres_changes',{event:'*',schema:'public',table:'clinics'},load).subscribe(status=>{if(status==='SUBSCRIBED')connection(true,'En línea · tiempo real');});
  }
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!configured){$('setupNotice').classList.remove('hidden');msg('Primero configura config.js siguiendo LEEME.txt.');return;}msg('Validando acceso…');client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){msg('No se pudo iniciar sesión. Verifica correo y contraseña.');return;}msg('');showApp();await load();realtime();});
  $('logoutBtn').addEventListener('click',logout);document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>goto(b.dataset.page)));document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>goto(b.dataset.goto)));
  $('patientSearch').addEventListener('input',render);$('paymentSearch').addEventListener('input',render);$('refreshPatients').addEventListener('click',load);$('refreshPayments').addEventListener('click',load);$('refreshClinics').addEventListener('click',load);
  $('clinicFilter').addEventListener('change',e=>{selectedClinic=e.target.value;render();});
  $('clinicForm').addEventListener('submit',async e=>{
    e.preventDefault();if(!client)return;
    if(!clinicTableAvailable){toast('Primero ejecuta el archivo supabase_schema.sql en Supabase.');return;}
    const name=$('clinicName').value.trim();if(!name){toast('Escribe el nombre de la clínica.');return;}
    const exists=[...clinics.map(c=>c.name),...patients.map(p=>String(p.clinic||'').trim())].some(n=>n.toLocaleLowerCase('es-MX')===name.toLocaleLowerCase('es-MX'));
    if(exists){toast('Esa clínica ya está registrada.');return;}
    const button=$('clinicForm').querySelector('button[type="submit"]');button.disabled=true;button.textContent='Guardando…';
    const {data,error}=await client.from('clinics').insert({name}).select().single();button.disabled=false;button.textContent='+ Agregar clínica';
    if(error){console.error(error);toast(error.code==='23505'?'Esa clínica ya existe.':'No se pudo guardar. Revisa la tabla y permisos en Supabase.');return;}
    clinics.push(data);selectedClinic=name;$('clinicName').value='';render();toast('Clínica agregada correctamente.');
  });
  if(!configured)$('setupNotice').classList.remove('hidden');
  $('todayLabel').textContent=new Intl.DateTimeFormat('es-MX',{dateStyle:'medium'}).format(new Date());
})();
