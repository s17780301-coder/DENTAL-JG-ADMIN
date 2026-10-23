(() => {
  const cfg = window.DENTAL_CONFIG || {};
  const configured = cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('PEGA_AQUI') && !cfg.supabaseAnonKey.includes('PEGA_AQUI');
  const $ = id => document.getElementById(id);
  function runBrandIntro(){const intro=$('brandIntro');if(!intro)return;try{if(!sessionStorage.getItem('dentalIntroSeen')){const AC=window.AudioContext||window.webkitAudioContext;if(AC){const ac=new AC();const osc=ac.createOscillator(),gain=ac.createGain();osc.type='sine';osc.frequency.setValueAtTime(660,ac.currentTime);osc.frequency.exponentialRampToValueAtTime(880,ac.currentTime+.16);gain.gain.setValueAtTime(.0001,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.045,ac.currentTime+.035);gain.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.28);osc.connect(gain);gain.connect(ac.destination);osc.start();osc.stop(ac.currentTime+.29);}sessionStorage.setItem('dentalIntroSeen','1');}}catch(e){}setTimeout(()=>intro.classList.add('done'),1550);}
  runBrandIntro();
  let client = null, channel = null, patients = [], payments = [], clinics = [], clinicTableAvailable = true, refreshTimer = null, loadInProgress = false, loadAgain = false;
  let selectedClinic = '__all__', warnedClinicTable = false;
  let adminManagers=[], adminReports=[];
  const money = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(Number(n)||0);
  const date = s => s ? new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(s)) : '—';
  const safe = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function toast(s){$('toast').textContent=s;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),3000)}
  function msg(s){$('loginMessage').textContent=s}
  function connection(ok,label){$('connectionDot').classList.toggle('ok',!!ok);$('connectionText').textContent=label}
  function showApp(){ $('loginView').classList.add('hidden');$('appView').classList.remove('hidden');$('todayLabel').textContent=new Intl.DateTimeFormat('es-MX',{dateStyle:'medium'}).format(new Date()); }
  function logout(){if(channel&&client)client.removeChannel(channel);channel=null;if(refreshTimer)clearInterval(refreshTimer);refreshTimer=null;patients=[];payments=[];clinics=[];$('appView').classList.add('hidden');$('loginView').classList.remove('hidden');if(client)client.auth.signOut();}
  function goto(page){document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$(page+'Page').classList.remove('hidden');document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('pageTitle').textContent=({overview:'Resumen general',patients:'Pacientes',payments:'Cobranza',clinics:'Clínicas',managers:'Gestores',reports:'Archivo de reportes quincenales',users:'Registro de roles'})[page]||'DENTAL JG';if(page==='users'&&client)loadAdminUsers();}
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
    const patientClinic=$('patientClinic');
    if(patientClinic){const previous=patientClinic.value;patientClinic.innerHTML='<option value="">Selecciona una clínica</option>'+names.map(n=>`<option value="${safe(n)}">${safe(n)}</option>`).join('');if(names.includes(previous))patientClinic.value=previous;else if(selectedClinic!=='__all__'&&names.includes(selectedClinic))patientClinic.value=selectedClinic;}
  }
  function renderClinics(){
    const names=[...new Set([...clinics.map(c=>c.name),...patients.map(p=>String(p.clinic||'').trim()).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'es'));
    $('clinicCount').textContent=`${names.length} ${names.length===1?'clínica':'clínicas'}`;
    $('clinicRows').innerHTML=names.length?names.map(n=>{const count=patients.filter(p=>String(p.clinic||'').trim()===n).length;const c=clinics.find(x=>x.name===n);return `<tr><td><span class="clinic-tag">${safe(n)}</span>${c?'':'<small class="legacy-clinic-note"> · nombre encontrado en pacientes</small>'}</td><td>${count}</td><td class="clinic-actions"><button class="small-action" data-select-clinic="${safe(n)}" type="button">Ver pacientes</button>${c?` <button class="small-action" data-edit-clinic="${safe(c.id)}" type="button">Editar nombre</button> <button class="small-action danger-action" data-delete-clinic="${safe(c.id)}" type="button">Eliminar</button>`:' <span class="legacy-clinic-note">Registra esta clínica para editarla</span>'}</td></tr>`}).join(''):'<tr><td colspan="3" class="empty">Todavía no hay clínicas. Agrega la primera arriba.</td></tr>';
    document.querySelectorAll('[data-select-clinic]').forEach(b=>b.addEventListener('click',()=>{selectedClinic=b.dataset.selectClinic;renderClinicControls();render();goto('patients');toast('Mostrando pacientes de: '+selectedClinic)}));
    document.querySelectorAll('[data-edit-clinic]').forEach(b=>b.addEventListener('click',()=>editClinic(b.dataset.editClinic)));
    document.querySelectorAll('[data-delete-clinic]').forEach(b=>b.addEventListener('click',()=>deleteClinic(b.dataset.deleteClinic)));
  }
  async function editClinic(id){
    const clinic=clinics.find(c=>String(c.id)===String(id));if(!clinic)return;
    const next=(window.prompt('Escribe el nuevo nombre de la clínica:',clinic.name)||'').trim();if(!next||next===clinic.name)return;
    if([...clinics].some(c=>String(c.id)!==String(id)&&String(c.name||'').toLocaleLowerCase('es-MX')===next.toLocaleLowerCase('es-MX'))){toast('Ya existe una clínica con ese nombre.');return;}
    const old=clinic.name;
    const {error}=await client.from('clinics').update({name:next}).eq('id',id);
    if(error){console.error(error);toast('No se pudo modificar la clínica: '+(error.message||'revisa los permisos.'));return;}
    const {error:patientError}=await client.from('patients').update({clinic:next}).eq('clinic',old);
    if(patientError){console.error(patientError);toast('Se cambió el nombre, pero algunos pacientes podrían conservar el anterior. Actualiza y revisa los pacientes.');}else toast('Nombre de clínica actualizado.');
    if(selectedClinic===old)selectedClinic=next;await load(true);
  }
  async function deleteClinic(id){
    const clinic=clinics.find(c=>String(c.id)===String(id));if(!clinic)return;
    const count=patients.filter(p=>String(p.clinic||'').trim()===clinic.name).length;
    const detail=count?` Hay ${count} paciente(s) asignado(s); se quitará su asignación de clínica, pero sus expedientes y pagos se conservarán.`:' Esta acción no se puede deshacer.';
    if(!window.confirm(`¿Eliminar la clínica “${clinic.name}”?${detail}`))return;
    if(count){const {error}=await client.from('patients').update({clinic:''}).eq('clinic',clinic.name);if(error){console.error(error);toast('No se pudo desasignar a los pacientes. La clínica no se eliminó.');return;}}
    const {error}=await client.from('clinics').delete().eq('id',id);
    if(error){console.error(error);toast('No se pudo eliminar la clínica: '+(error.message||'revisa los permisos.'));return;}
    if(selectedClinic===clinic.name)selectedClinic='__all__';await load(true);toast('Clínica eliminada. Los expedientes y pagos se conservaron.');
  }
  function render(){
    renderClinicControls();
    const visiblePatients=filteredPatients(), visiblePayments=filteredPayments();
    const paid = visiblePatients.filter(p=>Number(p.total||0)-Number(p.paid||0)<=0).length;
    const collected = visiblePatients.reduce((s,p)=>s+Math.max(0,Number(p.installment_amount||0)),0);
    const pending = visiblePayments.reduce((s,p)=>s+Number(p.amount||0),0);
    $('metricPatients').textContent=visiblePatients.length.toLocaleString('es-MX');$('metricCollected').textContent=money(collected);$('metricPending').textContent=money(pending);$('metricPaid').textContent=paid.toLocaleString('es-MX');
    const recent=[...visiblePayments].sort((a,b)=>new Date(b.paid_at||b.created_at)-new Date(a.paid_at||a.created_at)).slice(0,7);
    $('recentRows').innerHTML=recent.length?recent.map(p=>`<tr><td>${safe(p.patient_name||nameFor(p.patient_id))}</td><td><span class="pill">Pago registrado</span></td><td>${safe(date(p.paid_at||p.created_at))}</td><td class="money">${money(p.amount)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">Todavía no hay pagos registrados para esta selección.</td></tr>';
    const term=($('patientSearch')?.value||'').trim().toLocaleLowerCase('es-MX');const list=visiblePatients.filter(p=>[p.folio,p.name,p.first_names,p.surnames,p.phone,p.phone2,p.address,p.clinic,p.policy_number].some(x=>String(x||'').toLocaleLowerCase('es-MX').includes(term)));
    $('patientRows').innerHTML=list.length?list.map(p=>`<tr class="patient-row" data-open-patient="${safe(p.id)}" tabindex="0" role="button" aria-label="Abrir expediente de ${safe(p.name)}"><td>${safe(p.folio||'—')}</td><td><button type="button" class="patient-name-link" data-open-patient="${safe(p.id)}">${safe(p.name)}</button></td><td>${safe(p.phone||'—')}</td><td>${safe(p.address||'—')}</td><td>${safe(p.clinic||'—')}</td><td>${safe(p.policy_number||'—')}</td><td>${money(p.total)}</td><td>${money(p.paid)}</td><td class="money">${money(Math.max(0,Number(p.total||0)-Number(p.paid||0)))}</td><td><button type="button" class="small-action" data-edit-patient="${safe(p.id)}">Editar</button> <button type="button" class="small-action danger-action" data-delete-patient="${safe(p.id)}">Eliminar</button></td></tr>`).join(''):'<tr><td colspan="10" class="empty">No se encontraron pacientes para esta selección.</td></tr>';

    const pt=($('paymentSearch')?.value||'').toLowerCase();const plist=[...visiblePayments].filter(p=>String(p.patient_name||nameFor(p.patient_id)).toLowerCase().includes(pt)).sort((a,b)=>new Date(b.paid_at||b.created_at)-new Date(a.paid_at||a.created_at));
    $('paymentRows').innerHTML=plist.length?plist.map(p=>`<tr><td>${safe(p.patient_name||nameFor(p.patient_id))}</td><td>${safe(date(p.paid_at||p.created_at))}</td><td>${safe(p.concept||'Abono')}</td><td class="money">${money(p.amount)}</td><td>${safe(p.reference||'—')}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">Todavía no hay pagos registrados para esta selección.</td></tr>';
    renderClinics();
    document.querySelectorAll('[data-edit-patient]').forEach(b=>b.onclick=e=>{e.stopPropagation();editPatient(b.dataset.editPatient)});
    document.querySelectorAll('[data-delete-patient]').forEach(b=>b.onclick=e=>{e.stopPropagation();deletePatientPermanently(b.dataset.deletePatient)});
  }
  async function loadAdminManagers(){
    if(!client)return;const {data,error}=await client.from('collection_managers').select('id,created_by,full_name,phone,active,created_at,updated_at').order('full_name');
    if(error){$('adminManagerRows')&&($('adminManagerRows').innerHTML='<tr><td colspan="6" class="empty">No se pudo cargar collection_managers. Revisa el SQL y permisos.</td></tr>');return;}
    adminManagers=data||[];let assigned={};
    try{const {data:ps,error:pe}=await client.from('collection_portfolios').select('manager_id');if(!pe)(ps||[]).forEach(x=>{if(x.manager_id)assigned[x.manager_id]=(assigned[x.manager_id]||0)+1})}catch(e){}
    let totals={};try{const {data:rs,error:re}=await client.from('collection_receipts').select('manager_id,payment_amount');if(!re)(rs||[]).forEach(x=>{if(x.manager_id)totals[x.manager_id]=(totals[x.manager_id]||0)+Number(x.payment_amount||0)})}catch(e){}
    const grandTotal=Object.values(totals).reduce((sum,v)=>sum+Number(v||0),0);if($('metricManagerTotal'))$('metricManagerTotal').textContent=money(grandTotal);if($('metricManagerSummary'))$('metricManagerSummary').textContent=adminManagers.length?`${adminManagers.length} gestores · abre para ver el desglose`:'Todavía no hay gestores registrados';if($('managerSummaryRows'))$('managerSummaryRows').innerHTML=adminManagers.length?adminManagers.map(m=>`<tr><td><b>${safe(m.full_name)}</b></td><td>${safe(m.phone||'—')}</td><td>${assigned[m.id]||0}</td><td class="money">${money(totals[m.id]||0)}</td><td>${m.active===false?'Inactivo':'Activo'}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">Todavía no hay gestores registrados.</td></tr>';if($('adminManagerRows'))$('adminManagerRows').innerHTML=adminManagers.length?adminManagers.map(m=>`<tr><td><b>${safe(m.full_name)}</b></td><td>${safe(m.phone||'—')}</td><td>${assigned[m.id]||0}</td><td>${money(totals[m.id]||0)}</td><td>${m.active===false?'Inactivo':'Activo'}</td><td><button class="small-action" data-admin-edit-manager="${safe(m.id)}">Editar</button> <button class="small-action danger-action" data-admin-delete-manager="${safe(m.id)}">Eliminar</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">Todavía no hay gestores registrados.</td></tr>';
    document.querySelectorAll('[data-admin-edit-manager]').forEach(b=>b.onclick=()=>editAdminManager(b.dataset.adminEditManager));document.querySelectorAll('[data-admin-delete-manager]').forEach(b=>b.onclick=()=>deleteAdminManager(b.dataset.adminDeleteManager));
  }
  async function editAdminManager(id){const m=adminManagers.find(x=>String(x.id)===String(id));if(!m)return;const nameRaw=prompt('Nombre del gestor:',m.full_name||'');if(nameRaw===null)return;const name=nameRaw.trim();if(!name){toast('El nombre del gestor es obligatorio.');return}const phoneRaw=prompt('Teléfono del gestor:',m.phone||'');if(phoneRaw===null)return;const phone=phoneRaw.trim();const keyRaw=prompt('Nueva clave del gestor (deja vacío para conservar la actual):','');if(keyRaw===null)return;const key=keyRaw.trim();if(key&&key.length<4){toast('La nueva clave debe tener al menos 4 caracteres.');return}const payload={full_name:name,phone};if(key)payload.manager_key=key;try{const {data,error}=await client.from('collection_managers').update(payload).eq('id',id).select('id,full_name,phone').maybeSingle();if(error)throw error;if(!data){throw new Error('No se modificó ningún registro. Verifica los permisos UPDATE de collection_managers para la cuenta de Administración.')}toast(key?'Gestor actualizado y clave cambiada.':'Datos del gestor actualizados; la clave se conservó.');await loadAdminManagers();}catch(e){console.error(e);let message=e.message||'error';if(/duplicate|unique/i.test(message))message='Esa clave ya está asignada a otro gestor. Elige una clave diferente.';toast('No se pudo editar el gestor: '+message)}}
  async function deleteAdminManager(id){const m=adminManagers.find(x=>String(x.id)===String(id));if(!m||!confirm(`¿Eliminar al gestor ${m.full_name}? Las carteras asignadas pueden quedar sin gestor.`))return;const {error}=await client.from('collection_managers').delete().eq('id',id);if(error){toast('No se pudo eliminar: '+error.message);return;}toast('Gestor eliminado.');loadAdminManagers();}
  async function loadAdminReports(){if(!client||!$('adminReportRows'))return;const {data,error}=await client.from('collection_quincena_reports').select('*').order('created_at',{ascending:false});if(error){$('adminReportRows').innerHTML='<tr><td colspan="5" class="empty">Ejecuta la migración SQL de reportes quincenales para habilitar esta sección.</td></tr>';if($('reportsMsg'))$('reportsMsg').textContent=error.message;return;}adminReports=data||[];$('adminReportRows').innerHTML=adminReports.length?adminReports.map(r=>`<tr><td>${safe(r.quincena_date||'—')}</td><td>${safe(r.manager_name||'Sin gestor')}</td><td>${Array.isArray(r.report_rows)?r.report_rows.length:0}</td><td>${safe(date(r.created_at))}</td><td><button class="small-action" data-admin-print-report="${safe(r.id)}">Previsualizar / imprimir</button></td></tr>`).join(''):'<tr><td colspan="5" class="empty">Todavía no hay reportes archivados.</td></tr>';document.querySelectorAll('[data-admin-print-report]').forEach(b=>b.onclick=()=>printAdminReport(adminReports.find(r=>String(r.id)===b.dataset.adminPrintReport)));}
  function printAdminReport(r){if(!r)return;const rows=Array.isArray(r.report_rows)?r.report_rows:[];const w=window.open('','_blank');if(!w){toast('Permite ventanas emergentes para previsualizar el reporte.');return;}w.document.write(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Reporte quincenal</title><style>body{font:14px Arial;padding:24px}h1,h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #555;padding:7px;text-align:left}td.blank{min-width:110px} @media print{button{display:none}}</style><h1>DENTAL JG</h1><h2>Listado de recibos · Quincena ${safe(r.quincena_date||'')}</h2><p>Gestor: ${safe(r.manager_name||'Sin gestor')}</p><table><thead><tr><th>Folio</th><th>N.º de póliza</th><th>Nombre del cliente</th><th>Pago quincenal</th><th>Pago recibido (escribir)</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${safe(x.folio||'—')}</td><td>${safe(x.policy_number||'—')}</td><td>${safe(x.patient_name||'—')}</td><td>${money(x.installment_amount||0)}</td><td class="blank">&nbsp;</td></tr>`).join('')}</tbody></table><button onclick="window.print()">Imprimir</button></html>`);w.document.close();}
  async function load(silent=false){
    if(!client)return;
    if(loadInProgress){loadAgain=true;return;}
    loadInProgress=true;
    if(!silent)connection(false,'Actualizando…');
    try {
      const [pr,pa,cr]=await Promise.all([
        client.from('patients').select('*').order('created_at',{ascending:false}),
        client.from('payments').select('*').order('paid_at',{ascending:false}),
        client.from('clinics').select('*').order('name',{ascending:true})
      ]);
      if(pr.error||pa.error){connection(false,'Error de conexión');const detail=(pr.error&&pr.error.message)||(pa.error&&pa.error.message)||'Revisa tablas y permisos.';if(!silent)toast('No se pudieron leer los datos: '+detail);console.error(pr.error,pa.error);return;}
      patients=pr.data||[];payments=pa.data||[];
      await loadAdminManagers(); await loadAdminReports();
      clinicTableAvailable=!cr.error;clinics=cr.error?[]:(cr.data||[]);
      if(cr.error&&!warnedClinicTable){warnedClinicTable=true;toast('No se pudo leer la lista de clínicas. Revisa la tabla public.clinics y sus permisos.');console.warn('No se pudo leer clinics',cr.error);}
      render();connection(true,'En línea · actualizado automáticamente');
      const openId=$('patientDialog')?.dataset.patientId;
      if(openId&&!$('patientDialog').classList.contains('hidden'))openPatient(openId,false);
    } catch(err){console.error(err);connection(false,'Sin conexión');if(!silent)toast('No se pudo actualizar. Revisa tu conexión.');}
    finally {loadInProgress=false;if(loadAgain){loadAgain=false;load(true);}}
  }
  function realtime(){
    if(channel)client.removeChannel(channel);
    channel=client.channel('dental-jg-live').on('postgres_changes',{event:'*',schema:'public',table:'patients'},()=>load(true)).on('postgres_changes',{event:'*',schema:'public',table:'payments'},()=>load(true)).on('postgres_changes',{event:'*',schema:'public',table:'clinics'},()=>load(true)).subscribe(status=>{if(status==='SUBSCRIBED')connection(true,'En línea · actualizado automáticamente');else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')connection(false,'Reintentando conexión…');});
    if(refreshTimer)clearInterval(refreshTimer);
    refreshTimer=setInterval(()=>{if(document.visibilityState==='visible'&&client&&!$('appView').classList.contains('hidden'))load(true)},5000);
  }
  async function archiveDeletePatient(id){ return deletePatientPermanently(id); }
  async function deletePatientPermanently(id){
    const p=patients.find(item=>String(item.id)===String(id));if(!p)return;
    const history=payments.filter(x=>String(x.patient_id||'')===String(p.id)).length;
    if(!window.confirm(`¿Eliminar definitivamente a “${p.name}”?\n\nSe borrarán el expediente y sus ${history} pago(s) relacionados. Esta acción no se puede deshacer. No se conservará una copia en el archivo.`))return;
    const buttons=document.querySelectorAll(`[data-delete-patient="${CSS.escape(String(id))}"], #deletePatientManual`);buttons.forEach(b=>{b.disabled=true;b.textContent='Eliminando…'});
    const {error}=await client.rpc('delete_patient_permanently',{p_patient_id:p.id});
    buttons.forEach(b=>{b.disabled=false;b.textContent=b.id==='deletePatientManual'?'Eliminar cliente y pagos':'Eliminar'});
    if(error){console.error(error);toast('No se pudo eliminar: '+(error.message||'ejecuta la migración DENTAL_JG_10_8_11_CORRECCIONES.sql y revisa permisos.'));return;}
    const dialog=$('patientDialog');dialog.classList.add('hidden');dialog.setAttribute('aria-hidden','true');delete dialog.dataset.patientId;toast('Cliente y pagos eliminados.');await load(true);
  }
  async function editPatient(id){
    const p=patients.find(item=>String(item.id)===String(id));if(!p)return;
    const name=(prompt('Nombre completo:',p.name||'')||'').trim();if(!name)return;
    const phone=(prompt('Teléfono:',p.phone||'')||'').trim();
    const address=(prompt('Dirección:',p.address||'')||'').trim();
    const clinic=(prompt('Clínica:',p.clinic||'')||'').trim();
    const policy=(prompt('Número de póliza:',p.policy_number||'')||'').trim();
    const {error}=await client.from('patients').update({name,phone,address,clinic,policy_number:policy,updated_at:new Date().toISOString()}).eq('id',id);
    if(error){console.error(error);toast('No se pudo editar el cliente: '+error.message+' · revisa la migración SQL.');return;}
    toast('Datos del cliente actualizados.');await load(true);
  }
  function openPatient(id,focus=true){
    const p=patients.find(item=>String(item.id)===String(id));if(!p){toast('No encontré ese paciente. Actualizando…');load();return;}
    const dialog=$('patientDialog');if(!dialog)return;dialog.dataset.patientId=String(p.id);
    const paid=Number(p.paid||0),total=Number(p.total||0),remaining=Math.max(0,total-paid);
    const detailRows=[['Folio',p.folio||'Se asigna al registrar'],['Clínica',p.clinic||'—'],['Nombre(s)',p.first_names||p.name||'—'],['Apellidos',p.surnames||'—'],['Dirección',p.address||'—'],['Teléfono',p.phone||'—'],['Segundo teléfono',p.phone2||'—'],['Observaciones',p.observations||'—'],['Tratamiento',p.treatment||'—'],['Número de póliza',p.policy_number||'—'],['Costo total',money(total)],['Pagado',money(paid)],['Saldo pendiente',money(remaining)],['Número de pagos',String(p.installments??'—')],['Importe por pago',money(p.installment_amount||0)]];
    $('patientDialogTitle').textContent=p.name||'Expediente del paciente';
    $('patientDialogDetails').innerHTML=detailRows.map(([label,value])=>`<div class="detail-item"><small>${safe(label)}</small><strong>${safe(value)}</strong></div>`).join('');
    const history=payments.filter(x=>String(x.patient_id||'')===String(p.id)||(String(x.patient_name||'').trim().toLocaleLowerCase('es-MX')===String(p.name||'').trim().toLocaleLowerCase('es-MX'))).sort((a,b)=>new Date(b.paid_at||b.created_at)-new Date(a.paid_at||a.created_at));
    $('patientDialogPayments').innerHTML=history.length?history.map(x=>`<tr><td>${safe(date(x.paid_at||x.created_at))}</td><td>${safe(x.concept||'Abono')}</td><td>${money(x.amount)}</td><td>${safe(x.reference||'—')}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">Este paciente todavía no tiene pagos registrados.</td></tr>';
    dialog.classList.remove('hidden');dialog.setAttribute('aria-hidden','false');if(focus)$('closePatientDialog').focus();
  }
  document.addEventListener('click',e=>{const target=e.target.closest('[data-open-patient]');if(target){e.preventDefault();e.stopPropagation();openPatient(target.dataset.openPatient);}});document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('tr[data-open-patient]')){e.preventDefault();openPatient(e.target.dataset.openPatient);}});
  async function adminFunction(action, fields={}) {
    const {data,error}=await client.functions.invoke('administrar-usuarios',{body:{action,...fields}});
    if(error) { let detail=error.message||'No se pudo comunicar con la función segura.'; try { const ctx=error.context; if(ctx && typeof ctx.json==='function'){const payload=await ctx.json(); if(payload?.error) detail=payload.error; else if(payload?.message) detail=payload.message;} } catch(_) {} throw new Error(detail+' (administrar-usuarios)'); }
    if(data?.error) throw new Error(data.error);
    return data;
  }
  async function loadAdminUsers() {
    const body=$('userAdminRows'); if(!body)return;
    $('userAdminMessage').textContent='Consultando usuarios en Supabase…'; body.innerHTML='<tr><td colspan="4" class="empty">Cargando cuentas y roles…</td></tr>';
    try {
      const result=await adminFunction('list_users'); const list=Array.isArray(result)?result:(result.users||result.data?.users||[]);
      body.innerHTML=list.length?list.map(u=>{const id=String(u.id||u.user_id||'');const roles=Array.isArray(u.roles)&&u.roles.length?u.roles.map(x=>String(x).toLowerCase()):[String(u.role||'').toLowerCase()].filter(Boolean);const active=!(u.active===false||u.is_active===false||u.disabled===true||(u.banned_until&&new Date(u.banned_until).getTime()>Date.now()));const labels=roles.map(r=>({admin:'Administración',cobranza:'Cobranza',registro:'Registro',gestor:'Gestor'}[r]||r)).join(' + ')||'Sin rol';return `<tr data-user-id="${safe(id)}"><td>${safe(u.email||'Sin correo')}</td><td>${safe(labels)}<br><label><input type="checkbox" value="registro" ${roles.includes('registro')?'checked':''}> Registro</label> <label><input type="checkbox" value="cobranza" ${roles.includes('cobranza')?'checked':''}> Cobranza</label> <label><input type="checkbox" value="admin" ${roles.includes('admin')?'checked':''}> Administración</label></td><td>${active?'Activo':'Inactivo'}</td><td><button class="small-action" data-user-action="roles" data-id="${safe(id)}">Guardar roles</button> <button class="small-action" data-user-action="active" data-active="${active}" data-id="${safe(id)}">${active?'Desactivar':'Activar'}</button> <button class="small-action" data-user-action="password" data-id="${safe(id)}">Cambiar clave</button> <button class="small-action danger-action" data-user-action="delete" data-id="${safe(id)}">Eliminar</button></td></tr>` }).join(''):'<tr><td colspan="4" class="empty">La función respondió, pero no devolvió cuentas. Verifica que la función desplegada sea la versión actual y que el usuario tenga permiso de administrador.</td></tr>';
      $('userAdminMessage').textContent=list.length?`Lista actualizada: ${list.length} cuenta(s).`:'La consulta terminó sin cuentas.';
    } catch(err) { body.innerHTML=`<tr><td colspan="4" class="empty error-state">No se pudo cargar la lista. ${safe(err.message)}<br>Comprueba la conexión y el despliegue de la función administrar-usuarios en Supabase.</td></tr>`; $('userAdminMessage').textContent='Error al consultar usuarios y roles. '+err.message; }
  }
  $('userAdminRows').addEventListener('click',async e=>{const b=e.target.closest('button[data-user-action]');if(!b)return;const row=b.closest('tr'),id=b.dataset.id;if(!row||!id)return;b.disabled=true;try{const action=b.dataset.userAction;if(action==='roles'){const roles=[...row.querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value).filter(x=>['registro','cobranza','admin'].includes(x));if(!roles.length)throw new Error('Selecciona al menos un rol.');if(!confirm('¿Guardar los roles seleccionados?'))return;await adminFunction('set_roles',{user_id:id,roles});}else if(action==='active'){const active=b.dataset.active!=='true';if(!confirm(active?'¿Activar esta cuenta?':'¿Desactivar esta cuenta?'))return;await adminFunction('set_active',{user_id:id,active});}else if(action==='password'){const password=prompt('Nueva contraseña temporal (mínimo 8 caracteres):');if(password===null)return;if(password.length<8)throw new Error('La contraseña debe tener al menos 8 caracteres.');await adminFunction('reset_password',{user_id:id,password});}else if(action==='delete'){if(!confirm('¿Eliminar definitivamente esta cuenta?'))return;await adminFunction('delete_user',{user_id:id});}await loadAdminUsers();}catch(err){$('userAdminMessage').textContent='No se pudo completar la operación: '+err.message;}finally{b.disabled=false;}});
  $('createUserForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const button=form.querySelector('button[type=submit]');const email=$('newUserEmail').value.trim().toLowerCase();const password=$('newUserPassword').value;const role=$('newUserRole').value;if(!email||!password||password.length<8){$('userAdminMessage').textContent='Escribe un correo válido y una contraseña temporal de al menos 8 caracteres.';return;}if(button)button.disabled=true;$('userAdminMessage').textContent='Creando cuenta segura…';try{await adminFunction('create_user',{email,password,role});form.reset();await loadAdminUsers();$('userAdminMessage').textContent='Cuenta creada correctamente.';}catch(err){$('userAdminMessage').textContent='No se pudo crear la cuenta: '+err.message;}finally{if(button)button.disabled=false;}});
  $('refreshUsers').addEventListener('click',loadAdminUsers);
  $('ownAccountForm').addEventListener('submit',async e=>{e.preventDefault();const email=$('ownNewEmail').value.trim().toLowerCase(),password=$('ownNewPassword').value,confirmPassword=$('ownConfirmPassword').value;if(!email&&!password){$('ownAccountMessage').textContent='Escribe un nuevo correo o contraseña.';return;}if(password&&password.length<8){$('ownAccountMessage').textContent='La contraseña debe tener al menos 8 caracteres.';return;}if(password!==confirmPassword){$('ownAccountMessage').textContent='Las contraseñas no coinciden.';return;}if(!confirm('¿Confirmas cambiar tu propia cuenta?'))return;try{const changes={};if(email)changes.email=email;if(password)changes.password=password;const {data,error}=await client.auth.updateUser(changes);if(error)throw error;$('ownCurrentEmail').value=data?.user?.email||$('ownCurrentEmail').value;$('ownNewEmail').value='';$('ownNewPassword').value='';$('ownConfirmPassword').value='';$('ownAccountMessage').textContent=email?'Solicitud guardada. Revisa tu correo para confirmar el cambio si Supabase lo solicita.':'Contraseña actualizada correctamente.';}catch(err){$('ownAccountMessage').textContent='No se pudo cambiar la cuenta: '+err.message;}});
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!configured){$('setupNotice').classList.remove('hidden');msg('Primero configura config.js siguiendo LEEME.txt.');return;}msg('Validando acceso…');if(!client)client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,storage:window.localStorage}});const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){msg('No se pudo iniciar sesión. Verifica correo y contraseña.');return;}try{const roles=await adminFunction('my_roles');if(!(roles.roles||[]).includes('admin')){await client.auth.signOut();msg('Acceso denegado: Admon es exclusiva para cuentas con rol de Administración.');return;}}catch(err){await client.auth.signOut();msg('No se pudo verificar el rol de administrador: '+err.message);return;}const {data:userData}=await client.auth.getUser();$('ownCurrentEmail').value=userData?.user?.email||'';msg('');showApp();await load();await loadAdminUsers();realtime();});
  $('logoutBtn').addEventListener('click',logout);$('closePatientDialog').addEventListener('click',()=>{$('patientDialog').classList.add('hidden');$('patientDialog').setAttribute('aria-hidden','true');});$('patientDialog').addEventListener('click',e=>{if(e.target===$('patientDialog')){$('patientDialog').classList.add('hidden');$('patientDialog').setAttribute('aria-hidden','true');}});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&client&&!$('appView').classList.contains('hidden'))load(true)});document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>goto(b.dataset.page)));document.querySelectorAll('[data-goto]').forEach(b=>{b.addEventListener('click',()=>goto(b.dataset.goto));if(b.dataset.goto==='patients')b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();goto('patients');}});});
  $('deletePatientManual').addEventListener('click',()=>{const id=$('patientDialog')?.dataset.patientId;if(id)deletePatientPermanently(id);});$('editPatientManual')?.addEventListener('click',()=>{const id=$('patientDialog')?.dataset.patientId;if(id)editPatient(id);});
  $('patientSearch').addEventListener('input',render);$('paymentSearch').addEventListener('input',render);$('refreshPatients').addEventListener('click',load);$('refreshPayments').addEventListener('click',load);$('refreshClinics').addEventListener('click',load);
  $('clinicFilter').addEventListener('change',e=>{selectedClinic=e.target.value;render();});
  // El alta de pacientes está reservada a Registro de Clientes.
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
  $('managerForm')?.addEventListener('submit',async e=>{e.preventDefault();const name=$('managerName').value.trim();if(!name||!client)return;const btn=$('managerForm').querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Guardando…';$('managerMsg').textContent='Guardando gestor en Supabase…';try{const {data:userData,error:userError}=await client.auth.getUser();if(userError||!userData?.user)throw userError||new Error('La sesión expiró. Vuelve a iniciar sesión.');const managerKey=$('managerKey')?.value.trim()||'';if(!managerKey)throw new Error('Escribe la clave del gestor.');if(managerKey.length<4)throw new Error('La clave del gestor debe tener al menos 4 caracteres.');const {data:existingKey,error:keyCheckError}=await client.from('collection_managers').select('id').eq('manager_key',managerKey).limit(1);if(keyCheckError)throw keyCheckError;if(existingKey?.length)throw new Error('Esa clave ya está asignada a otro gestor. Elige una clave diferente.');const {data,error}=await client.from('collection_managers').insert({full_name:name,phone:$('managerPhone').value.trim(),manager_key:managerKey,created_by:userData.user.id}).select('id,created_by,full_name,phone,active,created_at,updated_at').single();if(error)throw error;$('managerForm').reset();$('managerMsg').textContent='Gestor guardado correctamente.';toast('Gestor registrado.');await loadAdminManagers();}catch(err){console.error(err);const duplicate=err.code==='23505'||/duplicate|unique|ya está asignada a otro gestor/i.test(err.message||'');$('managerMsg').textContent=duplicate?'Esa clave ya está asignada a otro gestor. Elige una clave diferente.':'No se pudo guardar el gestor: '+(err.message||'revisa la migración y los permisos de Supabase.');if(duplicate)toast('Esa clave ya está asignada a otro gestor. Elige una clave diferente.');}finally{btn.disabled=false;btn.textContent='+ Agregar gestor';}});
  $('refreshManagers')?.addEventListener('click',loadAdminManagers);$('refreshReports')?.addEventListener('click',loadAdminReports);
  if(!configured)$('setupNotice').classList.remove('hidden');
  $('todayLabel').textContent=new Intl.DateTimeFormat('es-MX',{dateStyle:'medium'}).format(new Date());
  // Supabase persists the login in local storage. Restore it automatically when the app reopens.
  if(configured){try{client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});client.auth.getSession().then(({data,error})=>{if(!error&&data&&data.session){showApp();load(true);realtime();}}).catch(err=>console.warn('No se pudo restaurar la sesión',err));client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN'&&session&&$('appView').classList.contains('hidden')){showApp();load(true);realtime();}});}catch(err){console.error('No se pudo inicializar la sesión',err);}}

  // Panel navegador: selector funcional de 10 diseños de recibo.
  const panelDesign=$('panelReceiptDesign');
  function panelReceiptMarkup(){
    const design=Math.max(1,Math.min(10,Number(panelDesign?.value)||1));
    const val=id=>safe($(id)?.value?.trim()||'—');
    const dateVal=$('panelReceiptDate')?.value||new Date().toISOString().slice(0,10);
    const dateText=dateVal==='—'?'—':new Intl.DateTimeFormat('es-MX',{dateStyle:'long'}).format(new Date(dateVal+'T12:00:00'));
    const amount=Number($('panelReceiptAmount')?.value||0);
    return `<article class="panel-receipt receipt-design-${design}"><header class="pr-head"><div><div class="pr-brand">DENTAL JG</div><h3>RECIBO DE COBRANZA</h3><small>Comprobante de pago</small></div><div><span class="pr-label">Folio</span><strong>${val('panelReceiptFolio')}</strong><br><span class="pr-label">Fecha</span><strong>${safe(dateText)}</strong></div></header><div class="pr-row"><div class="pr-field"><span class="pr-label">Recibimos de</span>${val('panelReceiptPatient')}</div><div class="pr-field"><span class="pr-label">Concepto</span>${val('panelReceiptConcept')}</div></div><div class="pr-row"><div class="pr-field"><span class="pr-label">Forma de pago</span>Pago recibido</div><div class="pr-field"><span class="pr-label">Moneda</span>Pesos mexicanos (MXN)</div></div><div class="pr-amount">IMPORTE RECIBIDO: ${money(amount)}</div><div class="pr-row"><div class="pr-field"><span class="pr-label">Firma / recepción</span>________________________________</div><div class="pr-field"><span class="pr-label">Observaciones</span>________________________________</div></div><footer class="pr-footer">recibo no válido sin sello</footer></article>`;
  }
  function panelPreview(){const area=$('panelReceiptPreviewArea');if(!area)return;area.innerHTML=panelReceiptMarkup();}
  if(panelDesign){const saved=localStorage.getItem('dentaljg_panel_receipt_design');panelDesign.value=saved&&Number(saved)>=1&&Number(saved)<=10?saved:'1';panelDesign.addEventListener('change',()=>{localStorage.setItem('dentaljg_panel_receipt_design',panelDesign.value);panelPreview();toast('Diseño de recibo aplicado.');});}
  $('panelReceiptPreview')?.addEventListener('click',panelPreview);
  $('panelReceiptPrint')?.addEventListener('click',()=>{panelPreview();const area=$('panelReceiptPreviewArea');const one=area.innerHTML;area.innerHTML='<div class="panel-print-sheet">'+one+one+one+one+'</div>';window.print();area.innerHTML=one;});
  $('panelReceiptPatient')?.addEventListener('input',panelPreview);$('panelReceiptFolio')?.addEventListener('input',panelPreview);$('panelReceiptAmount')?.addEventListener('input',panelPreview);$('panelReceiptConcept')?.addEventListener('input',panelPreview);$('panelReceiptDate')?.addEventListener('change',panelPreview);
  if($('panelReceiptDate'))$('panelReceiptDate').value=new Date().toISOString().slice(0,10);panelPreview();
})();
