(() => {
  "use strict";

  const cfg = window.DENTAL_CONFIG || {};
  const $ = id => document.getElementById(id);
  const FUNCTION_NAME = "administrar-usuarios";

  let db = null;
  let activeUserId = null;
  let initializing = false;
  let users = [];

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

  function say(text, error = false) {
    const el = $("userAdminMessage");
    if (!el) return;

    el.textContent = text;
    el.className = "user-message" + (error ? " error" : "");
    el.setAttribute("role", error ? "alert" : "status");
    el.setAttribute("aria-live", "polite");
  }

  async function invoke(action, fields = {}) {
    const { data, error } = await db.functions.invoke(
      FUNCTION_NAME,
      { body: { action, ...fields } }
    );

    if (error) {
      let msg = error.message || "Error al comunicarse con Supabase.";

      try {
        if (error.context &&
            typeof error.context.json === "function") {
          const body = await error.context.json();
          msg = body.error || body.message || msg;
        }
      } catch (_) {}

      throw new Error(msg);
    }

    if (data?.error) throw new Error(data.error);
    return data;
  }

  function addPanel() {
    const admin = $("admin");
    if (!admin || $("userManagementPanel")) return;

    const panel = document.createElement("div");
    panel.id = "userManagementPanel";
    panel.className = "panel";

    panel.innerHTML = `
      <div class="section-head">
        <div>
          <h3>Gestión de usuarios</h3>
          <p>
            Crea cuentas, asigna roles, activa o desactiva accesos
            y restablece contraseñas.
          </p>
        </div>
        <button id="refreshUsers" class="secondary" type="button">
          Actualizar lista
        </button>
      </div>

      <form id="createUserForm" class="user-create-grid">
        <label>Correo electrónico *
          <input id="newUserEmail" type="email"
            required maxlength="254" autocomplete="email">
        </label>

        <label>Contraseña temporal *
          <input id="newUserPassword" type="password"
            required minlength="8" maxlength="128"
            autocomplete="new-password">
        </label>

        <label>Rol *
          <select id="newUserRole" required>
            <option value="registro">Registro de clientes</option>
            <option value="cobranza">Cobranza</option>
            <option value="admin">Administración</option>
          </select>
        </label>

        <div class="user-create-action">
          <button id="createUserButton" class="primary" type="submit">
            Crear cuenta
          </button>
        </div>
      </form>

      <p class="muted">
        Usa contraseñas temporales seguras y compártelas de forma privada.
      </p>

      <div id="userAdminMessage" class="user-message"
        role="status" aria-live="polite">
        Preparando módulo…
      </div>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="userAdminRows">
            <tr><td colspan="4">Cargando usuarios…</td></tr>
          </tbody>
        </table>
      </div>
    `;

    admin.appendChild(panel);

    $("createUserForm").addEventListener("submit", createUser);
    $("refreshUsers").addEventListener("click", () => load
