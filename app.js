(() => {
const cfg=window.DENTAL_CONFIG||{}, $=id=>document.getElementById(id);
const ready=cfg.supabaseUrl&&!cfg.supabaseUrl.includes("PEGA_AQUI")&&cfg.supabaseAnonKey&&!cfg.supabaseAnonKey.includes("PEGA_AQUI");
let db=null,user=null,role="user",patients=[],payments=[],clinics=[];
const money=n=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(Number(n)||0);
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=s=>s?new Intl.DateTimeFormat("es-MX",{dateStyle:"medium",timeStyle:"short"}).format(new Date(s)):"—";
function note(s){$("notice").textContent=s;$("notice").classList.remove("hidden")}
function fail(err,where){console.error(where,err);note(where+": "+(err?.message||"No se pudo completar la operación. Revisa permisos y esquema de Supabase."))}
function showLogin(msg=""){$("loginMsg").textContent=msg}
function view(name){document.querySelectorAll(".view").forEach(x=>x.classList.add("hidden"));$(name).classList.remove("hidden");document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.view===name));$("viewTitle").textContent=({dashboard:"Resumen general",patients:"Registro de clientes",payments:"Cobranza y pagos",receipts:"Recibos",portfolios:"Carteras",managers:"Gestores y accesos",clinics:"Clínicas"})[name]||name}
async function checkRole(){role="user";const {data,error}=await db.from("app_user_roles").select("*").eq("user_id",user.id).maybeSingle();if(error){console.warn("No se pudo consultar app_user_roles",error);return}if(data){role=String(data.role||data.role_name||data.app_role||"user").toLowerCase()}}
function canAdmin(){return ["admin","administrator","administrador","owner"].includes(role)}
async function loadData(){
$("connection").textContent="● Sincronizando…";
const [pr,pa,cr]=await Promise.all([db.from("patients").select("*").order("created_at",{ascending:false}),db.from("payments").select("*").order("paid_at",{ascending:false}),db.from("clinics").select("*").order("name")]);
if(pr.error){fail(pr.error,"No se pudieron leer los pacientes");$("connection").textContent="● Error";return}
if(pa.error){fail(pa.error,"No se pudieron leer los pagos");$("connection").textContent="● Error";return}
patients=pr.data||[];payments=pa.data||[];clinics=cr.error?[]:(cr.data||[]);
render();$("connection").textContent="● Conectado a Supabase";
}
function render(){
$("mPatients").textContent=patients.length.toLocaleString("es-MX");$("mPayments").textContent=payments.length.toLocaleString("es-MX");$("mCollected").textContent=money(payments.reduce((s,p)=>s+Number(p.amount||0),0));$("mPending").textContent=money(patients.reduce((s,p)=>s+Math.max(0,Number(p.total||0)-Number(p.paid||0)),0));
const name=id=>patients.find(p=>p.id===id)?.name||"Paciente";
$("recentRows").innerHTML=payments.slice(0,8).map(p=>`<tr><td>${safe(p.patient_name||name(p.patient_id))}</td><td>${safe(date(p.paid_at||p.created_at))}</td><td>${safe(p.concept||"Abono")}</td><td>${money(p.amount)}</td></tr>`).join("")||'<tr><td colspan="4">No hay pagos visibles.</td></tr>';
const term=($("patientSearch").value||"").toLowerCase();const filtered=patients.filter(p=>[p.name,p.policy_number,p.clinic,p.phone].some(v=>String(v||"").toLowerCase().includes(term)));
$("patientRows").innerHTML=filtered.map(p=>`<tr><td>${safe(p.name)}</td><td>${safe(p.clinic||"—")}</td><td>${safe(p.policy_number||"—")}</td><td>${money(p.total)}</td><td>${money(p.paid)}</td><td>${money(Math.max(0,Number(p.total||0)-Number(p.paid||0)))}</td></tr>`).join("")||'<tr><td colspan="6">No se encontraron pacientes.</td></tr>';
$("payPatient").innerHTML='<option value="">Selecciona paciente</option>'+patients.map(p=>`<option value="${safe(p.id)}">${safe(p.name)} · ${safe(p.policy_number||"sin póliza")} · saldo ${money(Math.max(0,Number(p.total||0)-Number(p.paid||0)))}</option>`).join("");
const pt=($("paymentSearch").value||"").toLowerCase();$("paymentRows").innerHTML=payments.filter(p=>(p.patient_name||name(p.patient_id)).toLowerCase().includes(pt)||String(p.reference||"").toLowerCase().includes(pt)).map(p=>`<tr><td>${safe(p.patient_name||name(p.patient_id))}</td><td>${safe(date(p.paid_at||p.created_at))}</td><td>${safe(p.concept||"Abono")}</td><td>${money(p.amount)}</td><td>${safe(p.reference||"—")}</td></tr>`).join("")||'<tr><td colspan="5">No hay pagos visibles.</td></tr>';
$("clinicRows").innerHTML=clinics.map(c=>`<tr><td>${safe(c.name)}</td><td>${patients.filter(p=>String(p.clinic||"").trim()===String(c.name||"").trim()).length}</td></tr>`).join("")||'<tr><td colspan="2">No hay clínicas visibles.</td></tr>';
}
async function loadReceipts(){
const {data,error}=await db.from("collection_receipts").select("*").order("created_at",{ascending:false}).limit(300);
if(error){fail(error,"No se pudieron consultar los recibos");return}
$("receiptRows").innerHTML=(data||[]).map(r=>`<tr><td>${safe(r.folio||"—")}</td><td>${safe(r.patient_name||"—")}</td><td>${safe(date(r.created_at))}</td><td>${money(r.payment_amount)}</td><td>${safe(r.concept||"—")}</td></tr>`).join("")||'<tr><td colspan="5">No hay recibos visibles.</td></tr>';
}
async function loadPortfolios(){
const {data,error}=await db.from("collection_quincena_cartera").select("*").order("quincena_date",{ascending:false}).limit(500);
if(error){fail(error,"No se pudieron consultar las carteras");return}
$("portfolioRows").innerHTML=(data||[]).map(p=>`<tr><td>${safe(p.quincena_date||"—")}</td><td>${safe(p.patient_name||p.titular_name||"—")}</td><td>${safe(p.clinic||"—")}</td><td>${safe(p.policy_number||"—")}</td><td>${money(p.balance_net)}</td><td>${safe(p.manager_id||"—")}</td></tr>`).join("")||'<tr><td colspan="6">No hay carteras visibles.</td></tr>';
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();if(!ready){showLogin("Falta configurar config.js con la URL y clave pública de Supabase.");return}showLogin("Validando cuenta…");db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);const {data,error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error){showLogin("No se pudo iniciar sesión. Verifica correo, contraseña y estado de la cuenta.");return}user=data.user;await checkRole();$("login").classList.add("hidden");$("app").classList.remove("hidden");$("userEmail").textContent=user.email||"Usuario";$("userRole").textContent=role;$("today").textContent=new Intl.DateTimeFormat("es-MX",{dateStyle:"medium"}).format(new Date());document.body.classList.toggle("is-admin",canAdmin());document.querySelectorAll(".admin-only").forEach(b=>b.classList.toggle("hidden",!canAdmin()));await loadData();});
$("logout").addEventListener("click",async()=>{if(db)await db.auth.signOut();location.reload()});
document.querySelectorAll(".nav").forEach(b=>b.addEventListener("click",()=>view(b.dataset.view)));
$("refresh").addEventListener("click",loadData);$("patientSearch").addEventListener("input",render);$("paymentSearch").addEventListener("input",render);$("loadReceipts").addEventListener("click",loadReceipts);$("loadPortfolios").addEventListener("click",loadPortfolios);
$("patientForm").addEventListener("submit",async e=>{e.preventDefault();if(!canAdmin()){note("Solo Administración puede registrar clientes desde este panel.");return}const name=$("pName").value.trim(),clinic=$("pClinic").value.trim(),total=Number($("pTotal").value),inst=Math.max(0,Math.trunc(Number($("pInstallments").value)||0)),ia=Math.max(0,Number($("pInstallmentAmount").value)||0);if(!name||!clinic||!Number.isFinite(total)||total<0){$("patientMsg").textContent="Verifica nombre, clínica e importe.";return}
const payload={name,phone:$("pPhone").value.trim(),treatment:$("pTreatment").value.trim(),clinic,policy_number:$("pPolicy").value.trim(),total,paid:0,installments:inst,installment_amount:ia,source_device:"DENTAL JG PANEL"};
const {error}=await db.from("patients").insert(payload);if(error){fail(error,"No se pudo guardar el cliente");$("patientMsg").textContent="No guardado";return}$("patientForm").reset();$("pTotal").value="0";$("pInstallments").value="0";$("pInstallmentAmount").value="0";$("patientMsg").textContent="Cliente guardado.";await loadData()});
$("paymentForm").addEventListener("submit",async e=>{e.preventDefault();if(!canAdmin()){note("El registro directo de pagos desde el panel se limita a Administración. Para gestores, use el flujo autenticado de la app Gestor.");return}const patient=patients.find(p=>p.id===$("payPatient").value),amount=Number($("payAmount").value);if(!patient||!Number.isFinite(amount)||amount<=0){$("paymentMsg").textContent="Selecciona paciente e importe válido.";return}
const remaining=Math.max(0,Number(patient.total||0)-Number(patient.paid||0));if(amount>remaining+0.005){$("paymentMsg").textContent="El importe supera el saldo actual.";return}
$("paymentMsg").textContent="Registrando…";
// Intentionally no blind direct insert: payment/saldo update must be a single verified RPC transaction to prevent duplicate charges.
const {data,error}=await db.rpc("register_dental_jg_payment",{p_patient_id:patient.id,p_amount:amount,p_concept:$("payConcept").value.trim()||"Abono",p_reference:$("payReference").value.trim()});
if(error){fail(error,"No se registró el pago. No se hizo un INSERT alternativo para evitar duplicados.");$("paymentMsg").textContent="No registrado: falta o falló el RPC transaccional register_dental_jg_payment.";return}
$("paymentForm").reset();$("paymentMsg").textContent="Pago registrado.";await loadData()});
$("clinicForm").addEventListener("submit",async e=>{e.preventDefault();if(!canAdmin()){note("Solo Administración puede administrar clínicas.");return}const name=$("clinicName").value.trim();if(!name)return;if(clinics.some(c=>c.name.toLowerCase()===name.toLowerCase())){note("Esa clínica ya existe.");return}const {error}=await db.from("clinics").insert({name});if(error){fail(error,"No se pudo guardar la clínica");return}$("clinicName").value="";await loadData()});
if(!ready)showLogin("Configura config.js antes de iniciar sesión.");
})();