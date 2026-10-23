(()=>{
  'use strict';
  const cfg = window.DENTAL_CONFIG || {};
  const $ = id => document.getElementById(id);
  let db = null;
  let user = null;
  let currentRole = null;
  let adminPatients = [];
  let checkingUserId = null;
  let roleCheckPromise = null;

  const msg = (id, value) => { const el = $(id); if (el) el.textContent = value; };
  const setSaving = saving => {
    const button = $('save');
    button.disabled = saving;
    button.textContent = saving ? 'Guardando…' : 'Guardar cliente';
  };

  function setup() {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
      msg('loginMsg', 'No se pudo cargar la configuración de Supabase. Revisa config.js y tu conexión a internet.');
      return false;
    }
    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return true;
  }

  function showApp(isAuthorized) {
    $('loginCard').classList.toggle('hidden', !!isAuthorized);
    $('app').classList.toggle('hidden', !isAuthorized);
    if (isAuthorized) { msg('appMsg', 'Sesión iniciada. Puedes registrar un cliente.'); loadClinics(); loadPolicies(); loadAssignedManagers(); }
    const adminPanel = $('adminClients');
    if (adminPanel) adminPanel.classList.toggle('hidden', !(isAuthorized && currentRole === 'admin'));
    if (isAuthorized && currentRole === 'admin') loadAdminClients();
  }

  async function verifyRole(candidateUser) {
    if (!candidateUser || !db) return false;
    if (roleCheckPromise && checkingUserId === candidateUser.id) return roleCheckPromise;
    checkingUserId = candidateUser.id;
    roleCheckPromise = (async () => {
      msg('loginMsg', 'Verificando permisos…');
      let roleResult = await db.from('app_user_roles').select('role').eq('user_id', candidateUser.id).in('role', ['registro', 'admin']);
      if (roleResult.error && /user_id|column|schema cache|does not exist/i.test(roleResult.error.message || '')) roleResult = await db.from('app_user_roles').select('role').eq('id_usuario', candidateUser.id).in('role', ['registro', 'admin']);
      const { data, error } = roleResult;

      if (user && user.id !== candidateUser.id) return false;
      if (error) {
        console.error('No se pudieron consultar los roles:', error);
        await db.auth.signOut();
        if (!user || user.id === candidateUser.id) user = null;
        currentRole = null;
        showApp(false);
        msg('loginMsg', 'No se pudieron verificar tus permisos: ' + (error.message || 'error de consulta') + '. Confirma que public.app_user_roles permita consultar el rol propio.');
        return false;
      }
      if (!data || data.length === 0) {
        await db.auth.signOut();
        if (!user || user.id === candidateUser.id) user = null;
        currentRole = null;
        showApp(false);
        msg('loginMsg', 'La cuenta inició sesión, pero no tiene permiso de Registro. Solicita al administrador que asigne el rol registro.');
        return false;
      }
      user = candidateUser;
      currentRole = data.some(item => item.role === 'admin') ? 'admin' : data[0].role;
      showApp(true);
      msg('loginMsg', 'Acceso autorizado.');
      return true;
    })();
    try { return await roleCheckPromise; }
    finally {
      if (checkingUserId === candidateUser.id) {
        checkingUserId = null;
        roleCheckPromise = null;
      }
    }
  }

  function money(value) { return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(value)||0); }
  function safeText(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  async function loadClinics() { const sel=$('clinic'); if(!sel||!db)return; const old=sel.value; const {data,error}=await db.from('clinics').select('name,active').order('name'); if(error){sel.innerHTML='<option value="">No se pudieron cargar clínicas</option>';msg('appMsg','No se pudo cargar el catálogo de clínicas: '+error.message);return;} const names=(data||[]).filter(x=>x.active!==false).map(x=>x.name).filter(Boolean); sel.innerHTML='<option value="">Selecciona una clínica</option>'+names.map(n=>`<option value="${safeText(n)}">${safeText(n)}</option>`).join(''); if(names.includes(old))sel.value=old; }
  async function loadAssignedManagers(){const sel=$('assignedManager');if(!sel||!db)return;const {data,error}=await db.from('collection_managers').select('id,full_name,active').eq('active',true).order('full_name');if(error){sel.innerHTML='<option value="">No se pudieron cargar los gestores</option>';msg('appMsg','No se pudieron cargar los gestores. Verifica los permisos de lectura de collection_managers en Supabase: '+error.message);return;}sel.innerHTML='<option value="">Selecciona el gestor responsable</option>'+(data||[]).map(m=>`<option value="${safeText(m.id)}">${safeText(m.full_name)}</option>`).join('');if(!data||!data.length)msg('appMsg','No hay gestores activos. Pide a Administración que registre un gestor y su clave.');}
  function isJunkPolicyType(value){const clean=String(value||'').normalize('NFKC').trim();if(!clean||/[�\uFFFD]/.test(clean))return true;const compact=clean.toLocaleLowerCase('es-MX').replace(/[\s._-]/g,'');return /^(.)\1{3,}$/.test(compact)||/^o{3,}.*$/i.test(compact);}
  async function loadPolicies(){const sel=$('policy'),dl=$('policyOptions');if(!sel||!dl||!db)return;const {data,error}=await db.from('dental_jg_policies').select('name').eq('active',true).order('name');if(error){console.error('No se pudo cargar el catálogo de tipos de póliza:',error);dl.innerHTML='';msg('appMsg','No se pudo cargar el catálogo de tipos de póliza. Revisa la tabla dental_jg_policies y sus permisos en Supabase: '+(error.message||'error de consulta'));return;}const vals=[...new Set((data||[]).map(x=>String(x.name||'').trim()).filter(v=>v && !isJunkPolicyType(v)))];dl.innerHTML=vals.map(v=>`<option value="${safeText(v)}"></option>`).join('');if(!vals.length)msg('appMsg','El catálogo de tipos de póliza está vacío. Escribe un tipo nuevo y pulsa “Guardar tipo de póliza”.');}
  async function savePolicy(){const name=$('policy').value.trim().replace(/\s+/g,' ');if(!name||!db){msg('appMsg','Escribe primero el tipo de póliza.');return;}if(isJunkPolicyType(name)){msg('appMsg','Ese tipo de póliza parece contener caracteres repetidos o inválidos. Corrígelo antes de guardarlo.');return;}const button=$('savePolicy');button.disabled=true;button.textContent='Guardando…';try{const {error}=await db.from('dental_jg_policies').upsert({name,active:true,created_by:user.id},{onConflict:'name'});if(error)throw error;await loadPolicies();msg('appMsg','Tipo de póliza guardado. Ya podrás elegirlo en futuros registros.');}catch(e){console.error(e);msg('appMsg','No se pudo guardar el tipo de póliza: '+(e.message||'ejecuta la migración DENTAL_JG_10_8_11_CORRECCIONES.sql.'));}finally{button.disabled=false;button.textContent='Guardar tipo de póliza';}}
  function createFolioPreview(){const el=$('folio');if(el&&!el.value)el.value='Se asignará al guardar';}
  function updatePaymentLabels(){const monthly=$('paymentMode')?.value==='mensual';if($('installmentAmountLabel'))$('installmentAmountLabel').textContent=monthly?'Cantidad mensual *':'Cantidad quincenal *';if($('installmentsLabel'))$('installmentsLabel').textContent=monthly?'Tabulador (número de pagos mensuales) *':'Tabulador (número de pagos quincenales) *';calcPolicyTotal();}
  function calcPolicyTotal(){const amount=Number($('installmentAmount')?.value||0),count=parseInt($('installments')?.value||'0',10);const total=amount>0&&count>0?Math.round(amount*count*100)/100:0;if($('policyTotal'))$('policyTotal').value=total?total.toFixed(2):'';}
  $('paymentMode')?.addEventListener('change',updatePaymentLabels);$('installmentAmount')?.addEventListener('input',calcPolicyTotal);$('installments')?.addEventListener('input',calcPolicyTotal); updatePaymentLabels();
  async function loadAdminClients() {
    if (!db || !user || currentRole !== 'admin' || !$('adminClientRows')) return;
    $('adminClientRows').innerHTML = '<tr><td colspan="4">Cargando clientes…</td></tr>';
    const {data,error}=await db.from('patients').select('*').order('name');
    if(error){console.error(error);$('adminClientRows').innerHTML='<tr><td colspan="4">No se pudieron cargar los clientes. Revisa permisos de Supabase.</td></tr>';return;}
    adminPatients=data||[]; renderAdminClients();
  }
  function renderAdminClients() {
    if (!$('adminClientRows')) return;
    const q=($('adminClientSearch')?.value||'').trim().toLocaleLowerCase('es-MX');
    const rows=adminPatients.filter(p=>[p.folio,p.policy_number,p.name,p.first_names,p.surnames,p.address,p.clinic,p.phone,p.phone2].join(' ').toLocaleLowerCase('es-MX').includes(q));
    $('adminClientRows').innerHTML=rows.length?rows.map(p=>`<tr><td><strong>${safeText(p.folio||'Sin folio')} · ${safeText(p.name||'Sin nombre')}</strong><span class="admin-client-sub">Póliza: ${safeText(p.policy_number||'—')} · ${safeText(p.phone||'Sin teléfono')} · ${safeText(p.address||'Sin dirección')}</span></td><td>${safeText(p.clinic||'—')}</td><td>${money(Math.max(0,Number(p.total||0)-Number(p.paid||0)))}</td><td><button class="danger" type="button" data-admin-delete="${safeText(p.id)}">Archivar y eliminar</button></td></tr>`).join(''):'<tr><td colspan="4">No hay clientes que coincidan.</td></tr>';
    document.querySelectorAll('[data-admin-delete]').forEach(button=>button.addEventListener('click',()=>deleteAdminClient(button.dataset.adminDelete)));
  }
  async function deleteAdminClient(id) {
    if(currentRole!=='admin') { msg('adminClientsMsg','Solo un administrador puede eliminar clientes.'); return; }
    const p=adminPatients.find(x=>String(x.id)===String(id)); if(!p)return;
    const balance=Math.max(0,Number(p.total||0)-Number(p.paid||0));
    if(!window.confirm(`¿Archivar y eliminar a “${p.name}” de los clientes activos?\n\nSe conservará su expediente, pagos y recibos en el Archivo de clientes.\nSaldo pendiente: ${money(balance)}\n\nPodrás restaurarlo desde Cobranza. ¿Continuar?`))return;
    const buttons=document.querySelectorAll(`[data-admin-delete="${CSS.escape(String(id))}"]`);buttons.forEach(b=>{b.disabled=true;b.textContent='Procesando…'});
    const {error}=await db.rpc('archive_patient_account',{p_patient_id:id});
    if(error){console.error(error);msg('adminClientsMsg','No se pudo eliminar: '+(error.message||'revisa permisos y el SQL de archivo.'));renderAdminClients();return;}
    msg('adminClientsMsg','Cliente archivado correctamente.');
    await loadAdminClients();
  }
  $('savePolicy')?.addEventListener('click',savePolicy);$('refreshAdminClients')?.addEventListener('click',loadAdminClients);
  $('adminClientSearch')?.addEventListener('input',renderAdminClients);

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!db && !setup()) return;
    const email = $('email').value.trim();
    const password = $('password').value;
    msg('loginMsg', 'Validando acceso…');
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('Error de inicio de sesión:', error);
      msg('loginMsg', 'No se pudo iniciar sesión. Verifica el correo y la contraseña; si el problema continúa, confirma que la cuenta esté habilitada en Supabase Auth.');
      return;
    }
    user = data.user;
    await verifyRole(data.user);
  });

  $('logout').addEventListener('click', async () => {
    if (db) await db.auth.signOut();
    user = null;
    currentRole = null;
    showApp(false);
    msg('loginMsg', 'Sesión cerrada.');
  });

  $('clientForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!user || !db) {
      msg('appMsg', 'Tu sesión no está activa. Inicia sesión de nuevo.');
      showApp(false);
      return;
    }
    const holderName=$('holderName').value.trim(), name=$('patientFullName').value.trim().replace(/\s+/g,' '), nameParts=name.split(' '), firstNames=nameParts.length>1?nameParts.slice(0,-1).join(' '):name, surnames=nameParts.length>1?nameParts[nameParts.length-1]:'', clinic=$('clinic').value.trim(), policy=$('policy').value.trim().replace(/\s+/g,' '), policyNumber=$('policyNumber').value.trim(), assignedManagerId=$('assignedManager').value, address=$('address').value.trim(), phone=$('phone').value.trim(), paymentMode=$('paymentMode').value, paymentMethod=$('paymentMethod').value, installmentAmount=Number($('installmentAmount').value||0), installments=parseInt($('installments').value||'0',10), firstPaymentDate=$('firstPaymentDate').value, policyTotal=Number($('policyTotal').value||0);
    if(!holderName||!name||nameParts.length<2||!clinic||!policy||isJunkPolicyType(policy)||!policyNumber||!assignedManagerId||!address||!phone||!paymentMode||!paymentMethod||!firstPaymentDate||installments<1||installmentAmount<=0||policyTotal<=0){msg('appMsg','Completa los campos obligatorios. El nombre del paciente debe incluir nombres y apellidos; revisa también el tipo de póliza y el tabulador.');return;}
    if(Math.round(installmentAmount*installments*100)!==Math.round(policyTotal*100)){msg('appMsg','El total no coincide con el importe por pago multiplicado por el tabulador. Revisa los importes.');return;}
    const payload={p_name:name,p_phone:phone,p_treatment:policy,p_total:policyTotal,p_installments:installments,p_installment_amount:installmentAmount,p_policy_number:policyNumber,p_policy_type:policy,p_assigned_manager_id:assignedManagerId,p_clinic:clinic,p_first_names:firstNames,p_surnames:surnames,p_address:address,p_phone2:$('phone2').value.trim(),p_observations:$('observations').value.trim(),p_holder_name:holderName,p_payment_mode:paymentMode,p_tabulator:0,p_first_payment_date:firstPaymentDate,p_payment_method:paymentMethod};
    setSaving(true);
    msg('appMsg', 'Guardando el cliente en Supabase…');
    try {
      const { data, error } = await db.rpc('register_dental_jg_patient', payload);
      if (error) {
        console.error('Error al registrar paciente:', error);
        msg('appMsg', 'No se guardó el cliente: ' + error.message);
        return;
      }
      const {data:createdPatient}=await db.from('patients').select('folio').eq('id',data).maybeSingle(); msg('appMsg', 'Cliente registrado correctamente. Folio asignado por el sistema: ' + (createdPatient?.folio||'consulta el directorio de pacientes'));
      if (currentRole === 'admin') await loadAdminClients();
      $('clientForm').reset();
      $('folio').value=''; await loadPolicies(); await loadAssignedManagers(); createFolioPreview(); updatePaymentLabels(); calcPolicyTotal();
    } catch (error) {
      console.error('Error inesperado al registrar paciente:', error);
      msg('appMsg', 'Ocurrió un error de conexión. Revisa internet e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  });

  createFolioPreview();
  if (setup()) {
    db.auth.getSession().then(async ({ data, error }) => {
      if (error) {
        msg('loginMsg', 'No se pudo recuperar la sesión. Inicia sesión de nuevo.');
        return;
      }
      if (data.session) {
        user = data.session.user;
        await verifyRole(data.session.user);
      } else {
        showApp(false);
      }
    }).catch(error => {
      console.error('Error recuperando sesión:', error);
      showApp(false);
    });
    db.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        user = null;
        currentRole = null;
        showApp(false);
      }
      // SIGNED_IN se verifica en el manejador del formulario para evitar dos comprobaciones simultáneas.
    });
  }
})();
