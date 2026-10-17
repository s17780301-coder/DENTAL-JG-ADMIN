

(() => {
  "use strict";

  const CONFIG = window.DENTAL_CONFIG || {};
  const FUNCTION_NAME = "administrar-usuarios";
  const $ = id => document.getElementById(id);

  let client = null;
  let currentUser = null;
  let loaded = false;
  let users = [];

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function message(text, error = false) {
    const target = $("userAdminMessage");
    if (!target) return;
    target.textContent = text;
    target.className = error ? "user-message error" : "user-message";
  }

  async function callFunction(action, fields = {}) {
    const { data, error } = await client.functions.invoke(
      FUNCTION_NAME,
      { body: { action, ...fields } }
    );

    if (error) {
      let detail = error.message || "Error de comunicación.";
      try {
        const response = error.context;
        if (response && typeof response.json === "function") {
          const body = await response.json();
          detail = body.error || body.message || detail;
        }
      } catch (_) {}
      throw new Error(detail);
    }

    if (data?.error) throw new Error(data.error);
    return data;
  }

  function createInterface() {
    const admin = $("admin");
    if (!admin || $("userManagementPanel")) return;

    const panel = document.createElement("div");
    panel.id = "userManagementPanel";
    panel.className = "panel";
    panel.innerHTML = `
      <div class="section-head">
        <div>
          <h3>Gestión de usuarios</h3>
          <p>Crea cuentas, asigna permisos y restablece contraseñas.</p>
        </div>
        <button id="refreshUsers" class="secondary" type="button">
          Actualizar lista
        </button>
      </div>

      <form id="createUserForm" class="user-create-grid">
        <label>Correo electrónico *
          <input id="newUserEmail" type="email"
            autocomplete="off" required maxlength="254">
        </label>

        <label>Contraseña temporal *
          <input id="newUserPassword" type="password"
            autocomplete="new-password" minlength="8"
            required maxlength="128">
        </label>

        <label>Rol de la cuenta *
          <select id="newUserRole" required>
            <option value="registro">Registro de clientes</option>
            <option value="cobranza">Cobranza</option>
            <option value="admin">Administración</option>
          </select>
        </label>

        <div class="user-create-action">
          <button class="primary" id="createUserButton" type="submit">
            Crear cuenta
          </button>
        </div>
      </form>

      <p class="muted user-hint">
        Usa una contraseña temporal segura y entrégala al usuario por un
        medio privado. Nunca compartas la clave de servicio de Supabase.
      </p>

      <div id="userAdminMessage" class="user-message"
        role="status" aria-live="polite">
        Preparando gestión de usuarios…
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
    $("refreshUsers").addEventListener("click", loadUsers);
    $("userAdminRows").addEventListener("click", handleUserAction);
  }

  function roleName(role) {
    return ({
      admin: "Administración",
      cobranza: "Cobranza",
      registro: "Registro de clientes"
    })[String(role || "").toLowerCase()] || role || "Sin rol";
  }

  function userIsActive(user) {
    if (typeof user.active === "boolean") return user.active;
    if (typeof user.is_active === "boolean") return user.is_active;
    if (user.banned_until) {
      const time = new Date(user.banned_until).getTime();
      if (Number.isFinite(time) && time > Date.now()) return false;
    }
    return true;
  }

  function renderUsers() {
    const body = $("userAdminRows");
    if (!body) return;

    if (!users.length) {
      body.innerHTML =
        '<tr><td colspan="4">No se encontraron usuarios.</td></tr>';
      return;
    }

    body.innerHTML = users.map(user => {
      const id = String(user.id || user.user_id || "");
      const email = String(user.email || "");
      const role = String(
        user.role || user.role_name || user.app_role || ""
      ).toLowerCase();
      const active = userIsActive(user);

      return `
        <tr data-user-id="${escapeHTML(id)}">
          <td>${escapeHTML(email || "Sin correo")}</td>
          <td>
            <select class="edit-user-role" aria-label="Cambiar rol">
              <option value="registro" ${role === "registro" ? "selected" : ""}>
                Registro
              </option>
              <option value="cobranza" ${role === "cobranza" ? "selected" : ""}>
                Cobranza
              </option>
              <option value="admin" ${role === "admin" ? "selected" : ""}>
                Administración
              </option>
            </select>
          </td>
          <td>${active ? "Activo" : "Inactivo"}</td>
          <td>
            <div class="user-actions">
              <button type="button" class="secondary"
                data-action="role" data-id="${escapeHTML(id)}">
                Guardar rol
              </button>
              <button type="button" class="secondary"
                data-action="active" data-id="${escapeHTML(id)}"
                data-active="${active ? "true" : "false"}">
                ${active ? "Desactivar" : "Activar"}
              </button>
              <button type="button" class="secondary"
                data-action="password" data-id="${escapeHTML(id)}">
                Restablecer contraseña
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadUsers() {
    if (!client || !currentUser) return;

    message("Consultando usuarios autorizados…");

    const body = $("userAdminRows");
    if (body) {
      body.innerHTML =
        '<tr><td colspan="4">Cargando usuarios…</td></tr>';
    }

    try {
      const result = await callFunction("list_users");
      const list = Array.isArray(result)
        ? result
        : result.users || result.data?.users || [];

      users = list;
      renderUsers();
      message("Lista actualizada.");
    } catch (error) {
      message(
        "No se pudo cargar la lista: " + error.message,
        true
      );
      if (body) {
        body.innerHTML =
          '<tr><td colspan="4">No fue posible cargar usuarios.</td></tr>';
      }
    }
  }

  async function createUser(event) {
    event.preventDefault();

    const email = $("newUserEmail").value.trim().toLowerCase();
    const password = $("newUserPassword").value;
    const role = $("newUserRole").value;
    const button = $("createUserButton");

    if (!email || password.length < 8) {
      message("Escribe un correo válido y una contraseña de al menos 8 caracteres.", true);
      return;
    }

    if (!["admin", "registro", "cobranza"].includes(role)) {
      message("Selecciona un rol válido.", true);
      return;
    }

    button.disabled = true;
    message("Creando cuenta…");

    try {
      await callFunction("create_user", {
        email,
        password,
        role
      });

      $("createUserForm").reset();
      message("Solicitud de creación completada.");
      await loadUsers();
    } catch (error) {
      message("No se pudo crear la cuenta: " + error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function handleUserAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;
    const row = button.closest("tr");
    if (!id || !row) return;

    if (action === "password") {
      const password = prompt(
        "Escribe la nueva contraseña temporal (mínimo 8 caracteres):"
      );
      if (password === null) return;

      if (password.length < 8) {
        message("La contraseña debe tener al menos 8 caracteres.", true);
        return;
      }

      if (!confirm("¿Confirmas restablecer la contraseña de esta cuenta?")) {
        return;
      }

      try {
        button.disabled = true;
        await callFunction("reset_password", {
          user_id: id,
          password
        });
        message("Solicitud de restablecimiento completada.");
      } catch (error) {
        message("No se pudo restablecer: " + error.message, true);
      } finally {
        button.disabled = false;
      }
      return;
    }

    if (action === "role") {
      const role = row.querySelector(".edit-user-role").value;

      if (!confirm("¿Confirmas cambiar el rol de esta cuenta?")) return;

      try {
        button.disabled = true;
        await callFunction("set_role", {
          user_id: id,
          role
        });
        message("Solicitud de cambio de rol completada.");
        await loadUsers();
      } catch (error) {
        message("No se pudo cambiar el rol: " + error.message, true);
      } finally {
        button.disabled = false;
      }
      return;
    }

    if (action === "active") {
      const active = button.dataset.active !== "true";
      const question = active
        ? "¿Quieres activar esta cuenta?"
        : "¿Quieres desactivar esta cuenta?";

      if (!confirm(question)) return;

      try {
        button.disabled = true;
        await callFunction("set_active", {
          user_id: id,
          active
        });
        message("Solicitud de cambio de estado completada.");
        await loadUsers();
      } catch (error) {
        message("No se pudo cambiar el estado: " + error.message, true);
      } finally {
        button.disabled = false;
      }
    }
  }

  async function initialize() {
    if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey ||
        !window.supabase?.createClient) {
      return;
    }

    client = window.supabase.createClient(
      CONFIG.supabaseUrl,
      CONFIG.supabaseAnonKey
    );

    const { data, error } = await client.auth.getSession();
    if (error || !data?.session?.user) return;

    currentUser = data.session.user;

    const { data: roleData, error: roleError } = await client
      .from("app_user_roles")
      .select("role")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (roleError || roleData?.role !== "admin") return;

    createInterface();
    loaded = true;
    await loadUsers();
  }

  function start() {
    if (loaded) return;
    initialize().catch(error => {
      console.error("Gestión de usuarios:", error);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.addEventListener("focus", start);
})();
