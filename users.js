
(() => {
  "use strict";

  const cfg = window.DENTAL_CONFIG || {};
  const $ = id => document.getElementById(id);
  const FUNCTION_NAME = "administrar-usuarios";
  const ADMIN_ROLES = ["admin", "administrator", "administrador", "owner"];

  let db = null;
  let users = [];
  let actionBusy = false;
  let loadingUsers = false;
  let currentUserId = null;
  let checkingSession = false;

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
    el.setAttribute("aria-live", "polite");
  }

  function roleValue(value) {
    return String(value || "").toLowerCase().trim();
  }

  function getUserId(user) {
    return String(user.user_id || user.id || user.uid || "");
  }

  function getUserRole(user) {
    return roleValue(
      user.role || user.role_name || user.app_role || ""
    );
  }

  function isActive(user) {
    if (typeof user.active === "boolean") return user.active;
    if (typeof user.is_active === "boolean") return user.is_active;
    if (typeof user.isActive === "boolean") return user.isActive;
    return true;
  }

  async function invoke(action, fields = {}) {
    if (!db) throw new Error("Supabase todavía no está inicializado.");

    const { data, error } = await db.functions.invoke(
      FUNCTION_NAME,
      { body: { action, ...fields } }
    );

    if (error) {
      let message = error.message || "Error de Supabase.";

      try {
        if (error.context &&
            typeof error.context.json === "function") {
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

    if (!admin) {
      throw new Error("No se encontró la sección Administración en index.html.");
    }

    if ($("userManagementPanel")) return;

    const panel = document.createElement("div");
    panel.id = "userManagementPanel";
    panel.className = "panel";

    panel.innerHTML = `
      <div class="section-head">
        <div>
          <h3>Gestión de usuarios</h3>
          <p>
            Crea cuentas, asigna roles, administra accesos
            y restablece contraseñas.
          </p>
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
        role="status" aria-live="polite">
        Preparando módulo…
      </p>

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
            <tr><td colspan="4">Esperando consulta…</td></tr>
          </tbody>
        </table>
      </div>
    `;

    admin.appendChild(panel);

    $("createUserForm").addEventListener("submit", createUser);
    $("refreshUsers").addEventListener("click", () => loadUsers());
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
      const role = getUserRole(user);
      const active = isActive(user);

      if (!id) {
        return `
          <tr>
            <td>${esc(email)}</td>
            <td>${esc(role || "Sin rol")}</td>
            <td>${active ? "Activo" : "Inactivo"}</td>
            <td>No se recibió el identificador del usuario.</td>
          </tr>
        `;
      }

      return `
        <tr>
          <td>${esc(email)}</td>
          <td>
            <select data-role-user="${esc(id)}"
              aria-label="Rol de ${esc(email)}">
              <option value="registro"
                ${role === "registro" ? "selected" : ""}>
                Registro
              </option>
              <option value="cobranza"
                ${role === "cobranza" ? "selected" : ""}>
                Cobranza
              </option>
              <option value="admin"
                ${ADMIN_ROLES.includes(role) ? "selected" : ""}>
                Administración
              </option>
            </select>
            <button type="button" class="secondary"
              data-save-role="${esc(id)}">Guardar rol</button>
          </td>
          <td>${active ? "Activo" : "Inactivo"}</td>
          <td>
            <button type="button" class="secondary"
              data-toggle-user="${esc(id)}"
              data-active="${active}">
              ${active ? "Desactivar" : "Activar"}
            </button>
            <button type="button" class="secondary"
              data-reset-user="${esc(id)}">
              Restablecer contraseña
            </button>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-save-role]").forEach(button => {
      button.addEventListener("click", () =>
        saveRole(button.dataset.saveRole)
      );
    });

    tbody.querySelectorAll("[data-toggle-user]").forEach(button => {
      button.addEventListener("click", () =>
        setActive(
          button.dataset.toggleUser,
          button.dataset.active !== "true"
        )
      );
    });

    tbody.querySelectorAll("[data-reset-user]").forEach(button => {
      button.addEventListener("click", () =>
        resetPassword(button.dataset.resetUser)
      );
    });
  }

  async function loadUsers(successMessage = "Lista de usuarios actualizada.") {
    if (loadingUsers || !db || !currentUserId) return;

    loadingUsers = true;

    const button = $("refreshUsers");
    if (button) button.disabled = true;

    say("Consultando usuarios…");

    try {
      const data = await invoke("list_users");

      users = Array.isArray(data) ? data :
        Array.isArray(data?.users) ? data.users :
        Array.isArray(data?.data) ? data.data : [];

      renderUsers();
      say(successMessage);
    } catch (error) {
      say("No se pudo cargar la lista: " + error.message, true);
      console.error("Gestión de usuarios / list_users:", error);
    } finally {
      loadingUsers = false;
      if (button) button.disabled = false;
    }
  }

  async function createUser(event) {
    event.preventDefault();

    if (actionBusy) return;

    const email = $("newUserEmail").value.trim().toLowerCase();
    const password = $("newUserPassword").value;
    const role = $("newUserRole").value;

    if (!email || password.length < 8) {
      say(
        "Escribe un correo válido y una contraseña de al menos 8 caracteres.",
        true
      );
      return;
    }

    actionBusy = true;
    $("createUserButton").disabled = true;
    say("Creando cuenta…");

    let success = false;

    try {
      await invoke("create_user", { email, password, role });
      $("createUserForm").reset();
      success = true;
    } catch (error) {
      say("No se pudo crear la cuenta: " + error.message, true);
      console.error("Gestión de usuarios / create_user:", error);
    } finally {
      actionBusy = false;
      $("createUserButton").disabled = false;
    }

    if (success) {
      await loadUsers("Cuenta creada correctamente.");
    }
  }

  async function saveRole(userId) {
    if (!userId || actionBusy) return;

    const select = Array.from(
      document.querySelectorAll("[data-role-user]")
    ).find(el => el.dataset.roleUser === userId);

    if (!select) {
      say("No se encontró el selector del rol.", true);
      return;
    }

    actionBusy = true;
    say("Guardando rol…");

    let success = false;

    try {
      await invoke("set_role", {
        user_id: userId,
        role: select.value
      });
      success = true;
    } catch (error) {
      say("No se pudo guardar el rol: " + error.message, true);
      console.error("Gestión de usuarios / set_role:", error);
    } finally {
      actionBusy = false;
    }

    if (success) {
      await loadUsers("Rol actualizado correctamente.");
    }
  }

  async function setActive(userId, active) {
    if (!userId || actionBusy) return;

    const confirmed = confirm(
      active
        ? "¿Deseas activar esta cuenta?"
        : "¿Deseas desactivar esta cuenta?"
    );

    if (!confirmed) return;

    actionBusy = true;
    say("Actualizando estado…");

    let success = false;

    try {
      await invoke("set_active", {
        user_id: userId,
        active
      });
      success = true;
    } catch (error) {
      say("No se pudo cambiar el estado: " + error.message, true);
      console.error("Gestión de usuarios / set_active:", error);
    } finally {
      actionBusy = false;
    }

    if (success) {
      await loadUsers(
        active
          ? "Cuenta activada correctamente."
          : "Cuenta desactivada correctamente."
      );
    }
  }

  async function resetPassword(userId) {
    if (!userId || actionBusy) return;

    const password = prompt(
      "Escribe la nueva contraseña temporal (mínimo 8 caracteres):"
    );

    if (password === null) return;

    if (password.length < 8) {
      say("La contraseña debe tener al menos 8 caracteres.", true);
      return;
    }

    actionBusy = true;
    say("Restableciendo contraseña…");

    try {
      await invoke("reset_password", {
        user_id: userId,
        password
      });
      say("Contraseña restablecida correctamente.");
    } catch (error) {
      say("No se pudo restablecer la contraseña: " + error.message, true);
      console.error("Gestión de usuarios / reset_password:", error);
    } finally {
      actionBusy = false;
    }
  }

  async function checkCurrentSession() {
    if (checkingSession || !db) return;

    checkingSession = true;

    try {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;

      const session = data?.session;

      if (!session) {
        currentUserId = null;
        $("userManagementPanel")?.remove();
        return;
      }

      const userId = session.user.id;

      if (currentUserId === userId && $("userManagementPanel")) {
        return;
      }

      const { data: roleData, error: roleError } = await db
        .from("app_user_roles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (roleError) throw roleError;

      const role = roleValue(
        roleData?.role || roleData?.role_name || roleData?.app_role
      );

      if (!ADMIN_ROLES.includes(role)) {
        currentUserId = null;
        $("userManagementPanel")?.remove();
        return;
      }

      currentUserId = userId;
      addPanel();
      await loadUsers("Gestión de usuarios lista.");
    } catch (error) {
      console.error("Inicialización de Gestión de usuarios:", error);

      const admin = $("admin");
      if (admin && !$("userManagementPanel")) {
        addPanel();
      }

      say("No se pudo iniciar el módulo: " + error.message, true);
    } finally {
      checkingSession = false;
    }
  }

  function init() {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      console.error("Gestión de usuarios: falta la configuración de Supabase.");
      return;
    }

    if (!window.supabase?.createClient) {
      console.error("Gestión de usuarios: no se cargó la biblioteca Supabase.");
      return;
    }

    db = window.supabase.createClient(
      cfg.supabaseUrl,
      cfg.supabaseAnonKey
    );

    checkCurrentSession();

    db.auth.onAuthStateChange((event, session) => {
      setTimeout(() => {
        if (session) {
          checkCurrentSession();
        } else {
          currentUserId = null;
          $("userManagementPanel")?.remove();
        }
      }, 0);
    });

    window.addEventListener("focus", checkCurrentSession);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkCurrentSession();
    });

    // También detecta el inicio de sesión realizado por otro cliente
    // Supabase dentro de la misma página.
    window.setInterval(() => {
      if (!document.hidden) checkCurrentSession();
    }, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
