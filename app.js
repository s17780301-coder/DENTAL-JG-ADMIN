
(() => {
"use strict";

const cfg = window.DENTAL_CONFIG || {};
const $ = id => document.getElementById(id);

const ready = Boolean(
  cfg.supabaseUrl &&
  cfg.supabaseAnonKey &&
  !String(cfg.supabaseUrl).includes("PEGA_AQUI") &&
  !String(cfg.supabaseAnonKey).includes("PEGA_AQUI")
);

let db = null;
let user = null;
let role = "";
let patients = [];
let payments = [];
let clinics = [];

const money = n => new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN"
}).format(Number(n) || 0);

const safe = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;",
  '"': "&quot;", "'": "&#39;"
}[c]));

const date = s => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" :
    new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(d);
};

function note(message) {
  $("notice").textContent = message;
  $("notice").classList.remove("hidden");
}

function fail(error, where) {
  console.error(where, error);
  note(where + ": " + (error?.message || "Revisa Supabase."));
}

function showLogin(message = "") {
  $("loginMsg").textContent = message;
}

const roleMap = {
  admin: "admin",
  administrator: "admin",
  administrador: "admin",
  owner: "admin",
  cobranza: "cobranza",
  collection: "cobranza",
  collector: "cobranza",
  registro: "registro",
  registrador: "registro",
  registration: "registro",
  registro_clientes: "registro"
};

async function checkRole() {
  const { data, error } = await db
    .from("app_user_roles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(
      "No se pudieron verificar los permisos: " + error.message
    );
  }

  const raw = String(
    data?.role || data?.role_name || data?.app_role || ""
  ).toLowerCase().trim();

  role = roleMap[raw] || "";

  if (!role) {
    throw new Error(
      "La cuenta no tiene un rol autorizado: Administración, Cobranza o Registro."
    );
  }
}

function allowed(viewName) {
  return role === "admin" ||
    (role === "cobranza" && viewName === "collection") ||
    (role === "registro" && viewName === "patients");
}

function setNavigation() {
  document.querySelectorAll(".nav").forEach(button => {
    button.classList.toggle(
      "hidden",
      !allowed(button.dataset.view)
    );
  });

  $("userRole").textContent = ({
    admin: "Administración",
    cobranza: "Cobranza",
    registro: "Registro de clientes"
  })[role] || "Sin permiso";

  $("roleInfo").textContent =
    "Sesión autorizada: " + $("userRole").textContent +
    ". Supabase debe aplicar también los permisos RLS.";
}

function view(name) {
  if (!allowed(name)) {
    note("Tu cuenta no tiene permiso para abrir ese módulo.");
    return;
  }

  document.querySelectorAll(".view").forEach(section =>
    section.classList.add("hidden")
  );

  $(name).classList.remove("hidden");

  document.querySelectorAll(".nav").forEach(button =>
    button.classList.toggle("active", button.dataset.view === name)
  );

  $("viewTitle").textContent = ({
    patients: "Registro de clientes",
    collection: "Cobranza",
    admin: "Administración"
  })[name] || name;

  $("notice").classList.add("hidden");
}

function setCollectionPanel(panel) {
  document.querySelectorAll(".collection-panel").forEach(section =>
    section.classList.toggle("hidden", section.id !== panel)
  );

  document.querySelectorAll(".subtab").forEach(button =>
    button.classList.toggle("active", button.dataset.panel === panel)
  );

  if (panel === "receiptsPanel") loadReceipts();
  if (panel === "portfoliosPanel") loadPortfolios();
}

async function loadData() {
  $("connection").textContent = "● Sincronizando…";

  try {
    const tasks = [
      db.from("patients")
        .select("*")
        .order("created_at", { ascending: false })
    ];

    if (role === "admin" || role === "cobranza") {
      tasks.push(
        db.from("payments")
          .select("*")
          .order("paid_at", { ascending: false })
      );
    }

    // Registro también necesita leer las clínicas para el formulario.
    if (role === "admin" || role === "registro") {
      tasks.push(
        db.from("clinics")
          .select("*")
          .order("name")
      );
    }

    const results = await Promise.all(tasks);

    if (results[0].error) {
      throw new Error(
        "No se pudieron leer los clientes: " + results[0].error.message
      );
    }

    patients = results[0].data || [];
    let idx = 1;

    if (role === "admin" || role === "cobranza") {
      if (results[idx].error) {
        payments = [];
        fail(results[idx].error, "No se pudieron leer los pagos");
      } else {
        payments = results[idx].data || [];
      }
      idx++;
    } else {
      payments = [];
    }

    if (role === "admin" || role === "registro") {
      if (results[idx].error) {
        clinics = [];
        fail(results[idx].error, "No se pudieron leer las clínicas");
      } else {
        clinics = results[idx].data || [];
      }
    } else {
      clinics = [];
    }

    render();
    populateClinics();

    $("connection").textContent = "● Conectado a Supabase";
  } catch (error) {
    $("connection").textContent = "● Error";
    fail(error, "No se pudieron cargar los datos");
  }
}

function render() {
  const term = ($("patientSearch").value || "").toLowerCase();

  const filtered = patients.filter(p =>
    [p.name, p.policy_number, p.clinic, p.phone]
      .some(v => String(v || "").toLowerCase().includes(term))
  );

  $("patientRows").innerHTML = filtered.map(p => `
    <tr>
      <td>${safe(p.name)}</td>
      <td>${safe(p.clinic || "—")}</td>
      <td>${safe(p.policy_number || "—")}</td>
      <td>${safe(p.treatment || "—")}</td>
      <td>${money(p.total)}</td>
      <td>${money(p.paid)}</td>
      <td>${money(Math.max(0, Number(p.total || 0) - Number(p.paid || 0)))}</td>
    </tr>
  `).join("") ||
    '<tr><td colspan="7">No se encontraron clientes.</td></tr>';

  $("payPatient").innerHTML =
    '<option value="">Selecciona cliente</option>' +
    patients.map(p => `
      <option value="${safe(p.id)}">
        ${safe(p.name)} · póliza ${safe(p.policy_number || "—")}
        · saldo ${money(Math.max(0, Number(p.total || 0) - Number(p.paid || 0)))}
      </option>
    `).join("");

  const patientName = id =>
    patients.find(p => String(p.id) === String(id))?.name || "Cliente";

  const paymentTerm = ($("paymentSearch").value || "").toLowerCase();

  $("paymentRows").innerHTML = payments.filter(p =>
    String(p.patient_name || patientName(p.patient_id)).toLowerCase()
      .includes(paymentTerm) ||
    String(p.reference || "").toLowerCase().includes(paymentTerm)
  ).map(p => `
    <tr>
      <td>${safe(p.patient_name || patientName(p.patient_id))}</td>
      <td>${safe(date(p.paid_at || p.created_at))}</td>
      <td>${safe(p.concept || "Abono")}</td>
      <td>${money(p.amount)}</td>
      <td>${safe(p.reference || "—")}</td>
    </tr>
  `).join("") ||
    '<tr><td colspan="5">No hay pagos visibles.</td></tr>';

  $("clinicRows").innerHTML = clinics.map(c => `
    <tr>
      <td>${safe(c.name)}</td>
      <td>${patients.filter(p =>
        String(p.clinic || "").trim() === String(c.name || "").trim()
      ).length}</td>
    </tr>
  `).join("") ||
    '<tr><td colspan="2">No hay clínicas visibles.</td></tr>';
}

function populateClinics() {
  const select = $("pClinic");
  const current = select.value;

  select.innerHTML =
    '<option value="">Selecciona clínica</option>' +
    clinics.map(c =>
      `<option value="${safe(c.name)}">${safe(c.name)}</option>`
    ).join("");

  if (current && clinics.some(c => c.name === current)) {
    select.value = current;
  }
}

async function loadReceipts() {
  if (!allowed("collection")) return;

  const body = $("receiptRows");
  body.innerHTML = '<tr><td colspan="5">Cargando…</td></tr>';

  const { data, error } = await db
    .from("collection_receipts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    fail(error, "No se pudieron consultar los recibos");
    body.innerHTML =
      '<tr><td colspan="5">No fue posible cargar recibos.</td></tr>';
    return;
  }

  body.innerHTML = (data || []).map(r => `
    <tr>
      <td>${safe(r.folio || "—")}</td>
      <td>${safe(r.patient_name || "—")}</td>
      <td>${safe(date(r.created_at))}</td>
      <td>${money(r.payment_amount)}</td>
      <td>${safe(r.concept || "—")}</td>
    </tr>
  `).join("") ||
    '<tr><td colspan="5">No hay recibos visibles.</td></tr>';
}

async function loadPortfolios() {
  if (!allowed("collection")) return;

  const body = $("portfolioRows");
  body.innerHTML = '<tr><td colspan="6">Cargando…</td></tr>';

  const { data, error } = await db
    .from("collection_quincena_cartera")
    .select("*")
    .order("quincena_date", { ascending: false })
    .limit(500);

  if (error) {
    fail(error, "No se pudieron consultar las carteras");
    body.innerHTML =
      '<tr><td colspan="6">No fue posible cargar carteras.</td></tr>';
    return;
  }

  body.innerHTML = (data || []).map(p => `
    <tr>
      <td>${safe(p.quincena_date || "—")}</td>
      <td>${safe(p.patient_name || p.titular_name || "—")}</td>
      <td>${safe(p.clinic || "—")}</td>
      <td>${safe(p.policy_number || "—")}</td>
      <td>${money(p.balance_net)}</td>
      <td>${safe(p.manager_id || "—")}</td>
    </tr>
  `).join("") ||
    '<tr><td colspan="6">No hay carteras visibles.</td></tr>';
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (!ready) {
    showLogin("Falta configurar config.js con URL y clave pública de Supabase.");
    return;
  }

  const button = $("loginForm").querySelector("button");
  button.disabled = true;
  showLogin("Validando cuenta y permisos…");

  try {
    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

    const { data, error } = await db.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("password").value
    });

    if (error) {
      throw new Error("No se pudo iniciar sesión. Verifica correo y contraseña.");
    }

    user = data.user;
    await checkRole();

    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("userEmail").textContent = user.email || "Usuario";
    $("today").textContent = new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium"
    }).format(new Date());

    setNavigation();
    await loadData();

    view(role === "registro" ? "patients" :
         role === "cobranza" ? "collection" : "admin");

    if (role === "cobranza") setCollectionPanel("paymentsPanel");
  } catch (error) {
    showLogin(error.message || "Acceso denegado.");
    if (db) await db.auth.signOut().catch(() => {});
    role = "";
  } finally {
    button.disabled = false;
  }
});

$("logout").addEventListener("click", async () => {
  if (db) await db.auth.signOut();
  location.reload();
});

document.querySelectorAll(".nav").forEach(button =>
  button.addEventListener("click", () => view(button.dataset.view))
);

document.querySelectorAll(".subtab").forEach(button =>
  button.addEventListener("click", () => setCollectionPanel(button.dataset.panel))
);

$("refresh").addEventListener("click", loadData);
$("patientSearch").addEventListener("input", render);
$("paymentSearch").addEventListener("input", render);
$("loadReceipts").addEventListener("click", loadReceipts);
$("loadPortfolios").addEventListener("click", loadPortfolios);

$("patientForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (role !== "admin" && role !== "registro") {
    note("Solo Registro o Administración puede dar de alta clientes.");
    return;
  }

  const name = $("pName").value.trim();
  const clinic = $("pClinic").value.trim();
  const policy = $("pPolicy").value.trim();
  const total = Number($("pTotal").value);
  const installments = Number($("pInstallments").value);
  const installmentAmount = Number($("pInstallmentAmount").value);

  if (!name || !clinic || !policy ||
      !Number.isFinite(total) || total < 0 ||
      !Number.isInteger(installments) || installments < 1 ||
      !Number.isFinite(installmentAmount) || installmentAmount < 0) {
    $("patientMsg").textContent = "Verifica los campos obligatorios.";
    return;
  }

  // Evita duplicados entre los registros que esta cuenta puede consultar.
  // La unicidad global debe protegerse también con una restricción en SQL.
  if (patients.some(p =>
    String(p.policy_number || "").trim().toLowerCase() === policy.toLowerCase()
  )) {
    $("patientMsg").textContent =
      "Esa póliza ya existe entre los clientes visibles.";
    return;
  }

  const payload = {
    name,
    phone: $("pPhone").value.trim(),
    phone2: $("pPhone2").value.trim() || null,
    treatment: $("pTreatment").value,
    clinic,
    policy_number: policy,
    total,
    paid: 0,
    installments,
    installment_amount: installmentAmount,
    address: $("pAddress").value.trim() || null,
    observations: $("pObservations").value.trim() || null,
    source_device: "DENTAL JG PANEL"
  };

  const button = $("patientForm").querySelector('[type="submit"]');
  button.disabled = true;
  $("patientMsg").textContent = "Guardando…";

  try {
    const { error } = await db.from("patients").insert(payload);
    if (error) throw error;

    $("patientForm").reset();
    $("patientMsg").textContent = "Cliente guardado.";
    await loadData();
  } catch (error) {
    fail(error, "No se pudo guardar el cliente");
    $("patientMsg").textContent = "No guardado.";
  } finally {
    button.disabled = false;
  }
});

$("paymentForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (role !== "admin" && role !== "cobranza") {
    note("Tu rol no puede registrar pagos.");
    return;
  }

  const patient = patients.find(p =>
    String(p.id) === $("payPatient").value
  );
  const amount = Number($("payAmount").value);

  if (!patient || !Number.isFinite(amount) || amount <= 0) {
    $("paymentMsg").textContent = "Selecciona cliente e importe válido.";
    return;
  }

  const remaining = Math.max(
    0, Number(patient.total || 0) - Number(patient.paid || 0)
  );

  if (amount > remaining + 0.005) {
    $("paymentMsg").textContent = "El importe supera el saldo actual.";
    return;
  }

  const button = $("paymentForm").querySelector('[type="submit"]');
  button.disabled = true;
  $("paymentMsg").textContent = "Registrando pago de forma transaccional…";

  try {
    const { error } = await db.rpc("register_dental_jg_payment", {
      p_patient_id: patient.id,
      p_amount: amount,
      p_concept: $("payConcept").value.trim() || "Abono",
      p_reference: $("payReference").value.trim()
    });

    if (error) {
      throw new Error(
        "No se registró el pago. No se hizo INSERT alternativo. " +
        error.message
      );
    }

    $("paymentForm").reset();
    $("paymentMsg").textContent = "Pago registrado.";
    await loadData();
  } catch (error) {
    fail(error, "No se pudo confirmar el pago");
    $("paymentMsg").textContent =
      "No confirmado. Verifica el historial antes de volver a intentarlo.";
  } finally {
    button.disabled = false;
  }
});

$("clinicForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (role !== "admin") {
    note("Solo Administración puede gestionar clínicas.");
    return;
  }

  const name = $("clinicName").value.trim();
  if (!name) return;

  if (clinics.some(c =>
    String(c.name).trim().toLowerCase() === name.toLowerCase()
  )) {
    note("Esa clínica ya existe.");
    return;
  }

  const button = $("clinicForm").querySelector('[type="submit"]');
  button.disabled = true;

  try {
    const { error } = await db.from("clinics").insert({ name });
    if (error) throw error;

    $("clinicName").value = "";
    await loadData();
  } catch (error) {
    fail(error, "No se pudo guardar la clínica");
  } finally {
    button.disabled = false;
  }
});

if (!ready) {
  showLogin("Configura config.js antes de iniciar sesión.");
}
})();
                 
