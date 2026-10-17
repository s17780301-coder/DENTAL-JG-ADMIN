
(() => {
  "use strict";

  const cfg = window.DENTAL_CONFIG || {};
  const $ = id => document.getElementById(id);
  const FUNCTION_NAME = "administrar-usuarios";

  let db = null;
  let users = [];
  let busy = false;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

  function say(message, error = false) {
    const el = $("userAdminMessage");
    if (!el) return;
    el.textContent = message;
    el.className = "user-message" + (error ? " error" : "");
    el.setAttribute("role", error ? "alert" : "status");
  }

  async function invoke(action, fields = {}) {
    const { data, error } = await db.functions.invoke(
      FUNCTION_NAME,
      { body: { action, ...fields } }
    );

    if (error) {
      let message = error.message || "Error de Supabase.";
      try {
        if (error.context?.json) {
          const body = await error.context.json();
          message = body.error || body.message || message;
        }
      } catch (_) {}
      throw new Error(message);
    }

    if (data?.error) throw new Error(data.error);
    return data;
  }

  function addPanel() {
    const admin = $("admin");
    if (!admin) throw new Error("No se encontró el apartado Administración.");
    if ($("userManagementPanel")) return;

    const panel = document.createElement("div");
    panel.id = "userManagementPanel";
    panel.className = "panel";

    panel.innerHTML = `
      <div class="section-head">
        <div>
          <h3>Gestión de usuarios</h3>
          <p>Crea cuentas, asigna permisos y administra accesos.</p>
        </div>
        <button id="refreshUsers" class="secondary" type="button">
          Actualizar lista
        </button>
      </div>

      <form id="createUserForm" class="user-create-grid">
        <label>Correo electrónico *
          <input id="newUserEmail" type="email" required
            maxlength="254" autocomplete="email">
        </label>
        <label>Contraseña temporal *
          <input id="newUserPassword" type="password" required
            minlength="8" maxlength="128" autocomplete="new-password">
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

      <p id="userAdminMessage" class="user-message"
        role="status" aria-live="polite">Preparando módulo…</p>

      <div class="table-scroll">
        <table>
          <thead>
            <tr><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody id="userAdminRows">
            <tr><td colspan="4">Cargando usuarios…</td></tr>
          </tbody>
        </table>
      </div>
    `;

    admin.appendChild(panel);
    $("createUserForm").addEventListener("submit", createUser);
    $("refreshUsers").addEventListener("click", () => loadUsers());
  }

  function getUserId(user) {
    return user.user_id || user.id || user.uid || "";
  }

  function getUserRole(user) {
    return user.role || user.role_name || user.app_role || "Sin rol";
  }

  function isActive(user) {
    if (typeof user.active === "boolean") return user.active;
    if (typeof user.is_active === "boolean") return user.is_active;
    if (typeof user.isActive === "boolean") return user.isActive;
    return true;
  }

  function renderUsers() {
    const tbody = $("userAdminRows");
    if (!tbody) return;

    if (!users.length) {
      tbody.innerHTML =
        '<tr><td colspan="4">No se encontraron usuarios.</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(user => {
      const id = getUserId(user);
      const email = user.email || user.user_email || "Sin correo";
      const active = isActive(user);
      const role = getUserRole(user);

      return `
        <tr>
          <td>${esc(email)}</td>
          <td>
            <select data-role-user="${esc(id)}" aria-label="Rol de ${esc(email)}">
              <option value="registro" ${role === "registro" ? "selected" : ""}>Registro</option>
              <option value="cobranza" ${role === "cobranza" ? "selected" : ""}>Cobranza</option>
              <option value="admin" ${role === "admin" ? "selected" : ""}>Administración</option>
            </select>
            <button type="button" class="secondary"
              data-save-role="${esc(id)}">Guardar rol</button>
          </td>
          <td>${active ? "Activo" : "Inactivo"}</td>
          <td>
            <button type="button" class="secondary"
              data-toggle-user="${esc(id)}" data-active="${active}">
              ${active ? "Desactivar" : "Activar"}
            </button>
            <button type="button" class="secondary"
              data-reset-user="${esc(id)}">Restablecer contraseña</button>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-save-role]").forEach(button => {
      button.addEventListener("click", () => saveRole(button.dataset.saveRole));
    });

    tbody.querySelectorAll("[data-toggle-user]").forEach(button => {
      button.addEventListener("click", () =>
        setActive(button.dataset.toggleUser, button.dataset.active !== "true")
      );
    });

    tbody.querySelectorAll("[data-reset-user]").forEach(button => {
      button.addEventListener("click", () =>
        resetPassword(button.dataset.resetUser)
      );
    });
  }

  async function loadUsers(successMessage = "Lista de usuarios actualizada.") {
    if (busy) return;
    busy = true;
    const button = $("refreshUsers");
    if (button) button.disabled = true;
    say("Consultando usuarios…");

    try {
      const data = await invoke("list_users");
      users = Array.isArray(data) ? data :
        Array.isArray(data.users) ? data.users :
        Array.isArray(data.data) ? data.data : [];

      renderUsers();
      say(successMessage);
    } catch (error) {
      say("No se pudo cargar la lista: " + error.message, true);
      console.error("list_users", error);
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  }

  async function createUser(event) {
    event.preventDefault();
    if (busy) return;

    const email = $("newUserEmail").value.trim().toLowerCase();
    const password = $("newUserPassword").value;
    const role = $("newUserRole").value;
    if (!email || password.length < 8) {
      say("Escribe un correo válido y una contraseña de al menos 8 caracteres.", true);
      return;
    }

    busy = true;
    $("createUserButton").disabled = true;
    say("Creando cuenta…");

    try {
      await invoke("create_user", { email, password, role });
      $("createUserForm").reset();
      await loadUsers("Cuenta creada correctamente.");
    } catch (error) {
      say("No se pudo crear la cuenta: " + error.message, true);
      console.error("create_user", error);
    } finally {
      busy = false;
      $("createUserButton").disabled = false;
    }
  }

  async function saveRole(userId) {
    if (!userId || busy) return;
    const select = document.querySelector(`[data-role-user="${CSS.escape(userId)}"]`);
    if (!select) return;

    busy = true;
    say("Guardando rol…");
    try {
      await invoke("set_role", { user_id: userId, role: select.value });
      await loadUsers("Rol actualizado correctamente.");
    } catch (error) {
      say("No se pudo guardar el rol: " + error.message, true);
      console.error("set_role", error);
    } finally {
      busy = false;
    }
  }

  async function setActive(userId, active) {
    if (!userId || busy) return;

    if (!confirm(active
      ? "¿Deseas activar esta cuenta?"
      : "¿Deseas desactivar esta cuenta?")) return;

    busy = true;
    say("Actualizando estado…");
    try {
      await invoke("set_active", { user_id: userId, active });
      await loadUsers(active
        ? "Cuenta activada correctamente."
        : "Cuenta desactivada correctamente.");
    } catch (error) {
      say("No se pudo cambiar el estado: " + error.message, true);
      console.error("set_active", error);
    } finally {
      busy = false;
    }
  }

  async function resetPassword(userId) {
    if (!userId || busy) return;
    const password = prompt("Escribe la nueva contraseña temporal (mínimo 8 caracteres):");
    if (password === null) return;

    if (password.length < 8) {
      say("La contraseña debe tener al menos 8 caracteres.", true);
      return;
    }

    busy = true;
    say("Restableciendo contraseña…");
    try {
      await invoke("reset_password", { user_id: userId, password });
      say("Contraseña restablecida correctamente.");
    } catch (error) {
      say("No se pudo restablecer la contraseña: " + error.message, true);
      console.error("reset_password", error);
    } finally {
      busy = false;
    }
  }

  async function init() {
    try {
      if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
        throw new Error("Falta la configuración pública de Supabase.");
      }

      if (!window.supabase?.createClient) {
        throw new Error("No se cargó la biblioteca de Supabase.");
      }

      db = window.supabase.createClient(
        cfg.supabaseUrl,
        cfg.supabaseAnonKey
      );

      const { data: sessionData, error: sessionError } =
        await db.auth.getSession();

      if (sessionError) throw sessionError;
      if (!sessionData.session) return;

      const userId = sessionData.session.user.id;
      const { data: roleData, error: roleError } = await db
        .from("app_user_roles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (roleError) throw roleError;

      const role = String(
        roleData?.role || roleData?.role_name || roleData?.app_role || ""
      ).toLowerCase().trim();

      if (!["admin", "administrator", "administrador", "owner"].includes(role)) {
        return;
      }

      addPanel();
      await loadUsers("Gestión de usuarios lista.");
    } catch (error) {
      console.error("Inicialización de Gestión de usuarios:", error);
      const admin = $("admin");
      if (admin && !$("userManagementPanel")) {
        const panel = document.createElement("div");
        panel.id = "userManagementPanel";
        panel.className = "panel";
        panel.innerHTML = `
          <h3>Gestión de usuarios</h3>
          <p class="user-message error">
            No se pudo iniciar el módulo. ${esc(error.message)}
          </p>`;
        admin.appendChild(panel);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
