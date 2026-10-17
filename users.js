
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
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);

  function say(text, error = false) {
    const el = $("userAdminMessage");
    if (!el) return;
    el.textContent = text;
    el.className = "user-message" + (error ? " error" : "");
    el.setAttribute("role", error ? "alert" : "status");
    el.setAttribute("aria-live", "polite");
  }

  function accountSay(text, error = false) {
    const el = $("accountMessage");
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
        if (error.context && typeof error.context.json === "function") {
          const body = await error.context.json();
          msg = body.error || body.message || msg;
        }
      } catch (_) {}
      throw new Error(msg);
    }

    if (data?.error) throw new Error(data.error);
    return data;
  }

  // PANEL PARA CAMBIAR EL CORREO Y LA CONTRASEÑA
  function addAccountPanel(currentUser) {
    const admin = $("admin");
    if (!admin || $("myAccountPanel")) return;

    const panel = document.createElement("div");
    panel.id = "myAccountPanel";
    panel.className = "panel";

    panel.innerHTML = `
      <div class="section-head">
        <div>
          <h3>Mi cuenta de administrador</h3>
          <p>
            Cambia tu correo electrónico o contraseña desde el panel,
            sin modificar el código del sistema.
          </p>
        </div>
      </div>

      <p class="muted">
        Correo actual:
        <strong id="accountCurrentEmail">${esc(currentUser.email || "Sin correo")}</strong>
      </p>

      <form id="accountEmailForm" class="user-create-grid">
        <label>
          Nuevo correo electrónico
          <input
            id="accountNewEmail"
            type="email"
            required
            maxlength="254"
            autocomplete="email"
            placeholder="nuevo@correo.com">
        </label>

        <div class="user-create-action">
          <button
            id="accountEmailButton"
            class="secondary"
            type="submit">
            Cambiar correo
          </button>
        </div>
      </form>

      <p class="muted">
        Supabase puede solicitar confirmación del correo actual y del nuevo.
        Revisa tus mensajes y completa las confirmaciones antes de usar
        el nuevo correo para iniciar sesión.
      </p>

      <form id="accountPasswordForm" class="user-create-grid">
        <label>
          Nueva contraseña
          <input
            id="accountNewPassword"
            type="password"
            required
            minlength="8"
            maxlength="128"
            autocomplete="new-password"
            placeholder="Mínimo 8 caracteres">
        </label>

        <label>
          Confirmar contraseña
          <input
            id="accountConfirmPassword"
            type="password"
            required
            minlength="8"
            maxlength="128"
            autocomplete="new-password"
            placeholder="Repite la contraseña">
        </label>

        <div class="user-create-action">
          <button
            id="accountPasswordButton"
            class="primary"
            type="submit">
            Actualizar contraseña
          </button>
        </div>
      </form>

      <div
        id="accountMessage"
        class="user-message"
        role="status"
        aria-live="polite">
      </div>
    `;

    admin.prepend(panel);

    $("accountEmailForm").addEventListener(
      "submit",
      changeOwnEmail
    );

    $("accountPasswordForm").addEventListener(
      "submit",
      changeOwnPassword
    );
  }

  // CAMBIAR EL CORREO DE LA CUENTA CON SESIÓN INICIADA
  async function changeOwnEmail(event) {
    event.preventDefault();

    const input = $("accountNewEmail");
    const button = $("accountEmailButton");
    const email = input.value.trim().toLowerCase();
    const currentEmail = String(
      $("accountCurrentEmail").textContent || ""
    ).trim().toLowerCase();

    if (!email || !email.includes("@")) {
      accountSay("Escribe un correo electrónico válido.", true);
      return;
    }

    if (email === currentEmail) {
      accountSay("Ese ya es el correo actual.", true);
      return;
    }

    if (!confirm(
      "¿Confirmas la solicitud para cambiar el correo de tu cuenta? " +
      "Necesitarás completar las confirmaciones que envíe Supabase."
    )) {
      return;
    }

    button.disabled = true;
    accountSay("Solicitando cambio de correo…");

    try {
      const { error } = await db.auth.updateUser({ email });

      if (error) throw error;

      input.value = "";

      accountSay(
        "Solicitud enviada correctamente. Revisa el correo actual y " +
        "el nuevo correo, y completa las confirmaciones que te envíe " +
        "Supabase. El cambio puede quedar pendiente hasta confirmarlo."
      );
    } catch (e) {
      accountSay(
        "No se pudo solicitar el cambio de correo: " +
        (e.message || "Error de Supabase."),
        true
      );
    } finally {
      button.disabled = false;
    }
  }

  // CAMBIAR LA CONTRASEÑA DE LA PROPIA CUENTA
  async function changeOwnPassword(event) {
    event.preventDefault();

    const password = $("accountNewPassword").value;
    const confirmation = $("accountConfirmPassword").value;
    const button = $("accountPasswordButton");

    if (password.length < 8) {
      accountSay(
        "La contraseña debe tener al menos 8 caracteres.",
        true
      );
      return;
    }

    if (password !== confirmation) {
      accountSay("Las contraseñas no coinciden.", true);
      return;
    }

    if (!confirm(
      "¿Confirmas actualizar la contraseña de tu cuenta de administrador?"
    )) {
      return;
    }

    button.disabled = true;
    accountSay("Actualizando contraseña…");

    try {
      const { error } = await db.auth.updateUser({ password });

      if (error) throw error;

      $("accountPasswordForm").reset();

      accountSay(
        "Contraseña actualizada correctamente. Utiliza la nueva " +
        "contraseña la próxima vez que inicies sesión."
      );
    } catch (e) {
      accountSay(
        "No se pudo cambiar la contraseña: " +
        (e.message || "Error de Supabase."),
        true
      );
    } finally {
      button.disabled = false;
    }
  }

  // PANEL DE GESTIÓN DE USUARIOS EXISTENTE
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

        <button
          id="refreshUsers"
          class="secondary"
          type="button">
          Actualizar lista
        </button>
      </div>

      <form id="createUserForm" class="user-create-grid">
        <label>
          Correo electrónico *
          <input
            id="newUserEmail"
            type="email"
            required
            maxlength="254"
            autocomplete="email">
        </label>

        <label>
          Contraseña temporal *
          <input
            id="newUserPassword"
            type="password"
            required
            minlength="8"
            maxlength="128"
            autocomplete="new-password">
        </label>

        <label>
          Rol *
          <select id="newUserRole" required>
            <option value="registro">Registro de clientes</option>
            <option value="cobranza">Cobranza</option>
            <option value="admin">Administración</option>
          </select>
        </label>

        <div class="user-create-action">
          <button
            id="createUserButton"
            class="primary"
            type="submit">
            Crear cuenta
          </button>
        </div>
      </form>

      <p class="muted">
        Usa contraseñas temporales seguras y compártelas de forma privada.
      </p>

      <div
        id="userAdminMessage"
        class="user-message"
        role="status"
        aria-live="polite">
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
            <tr>
              <td colspan="4">Cargando usuarios…</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    admin.appendChild(panel);

    $("createUserForm").addEventListener("submit", createUser);
    $("refreshUsers").addEventListener("click", () => loadUsers());
    $("userAdminRows").addEventListener("click", userAction);
  }

  function isActive(u) {
    if (typeof u.active === "boolean") return u.active;
    if (typeof u.is_active === "boolean") return u.is_active;

    if (u.banned_until) {
      const t = new Date(u.banned_until).getTime();
      if (Number.isFinite(t) && t > Date.now()) return false;
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

    body.innerHTML = users.map(u => {
      const id = String(u.id || u.user_id || "");
      const email = String(u.email || "");
      const role = String(
        u.role || u.role_name || u.app_role || ""
      ).toLowerCase();
      const active = isActive(u);

      return `
        <tr data-user-id="${esc(id)}">
          <td>${esc(email || "Sin correo")}</td>

          <td>
            <select
              class="edit-user-role"
              aria-label="Rol para ${esc(email)}">
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
              <button
                type="button"
                class="secondary"
                data-action="role"
                data-id="${esc(id)}">
                Guardar rol
              </button>

              <button
                type="button"
                class="secondary"
                data-action="active"
                data-id="${esc(id)}"
                data-active="${active}">
                ${active ? "Desactivar" : "Activar"}
              </button>

              <button
                type="button"
                class="secondary"
                data-action="password"
                data-id="${esc(id)}">
                Restablecer contraseña
              </button>

              <button
                type="button"
                class="danger"
                data-action="delete"
                data-id="${esc(id)}">
                Eliminar cuenta
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadUsers(
    successMessage = "Lista de usuarios actualizada correctamente."
  ) {
    if (!db || !activeUserId) return false;

    say("Consultando usuarios…");

    try {
      const result = await invoke("list_users");

      users = Array.isArray(result)
        ? result
        : (result.users || result.data?.users || []);

      renderUsers();
      say(successMessage);
      return true;
    } catch (e) {
      say("No se pudieron cargar los usuarios: " + e.message, true);

      const body = $("userAdminRows");
      if (body) {
        body.innerHTML =
          '<tr><td colspan="4">Error al cargar. Revisa el mensaje anterior.</td></tr>';
      }

      return false;
    }
  }

  async function createUser(event) {
    event.preventDefault();

    const email = $("newUserEmail").value.trim().toLowerCase();
    const password = $("newUserPassword").value;
    const role = $("newUserRole").value;
    const button = $("createUserButton");

    if (!email || password.length < 8) {
      say(
        "Escribe un correo válido y una contraseña de al menos 8 caracteres.",
        true
      );
      return;
    }

    button.disabled = true;
    say("Creando cuenta…");

    try {
      await invoke("create_user", { email, password, role });
      $("createUserForm").reset();

      const refreshed = await loadUsers("Cuenta creada correctamente.");

      if (!refreshed) {
        say(
          "La cuenta se creó correctamente, pero no se pudo actualizar " +
          "la lista. Pulsa «Actualizar lista».",
          true
        );
      }
    } catch (e) {
      say("No se pudo crear la cuenta: " + e.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function userAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;
    const row = button.closest("tr");

    if (!id || !row) {
      say(
        "No se encontró el identificador del usuario. " +
        "Actualiza la lista e inténtalo de nuevo.",
        true
      );
      return;
    }

    try {
      button.disabled = true;

      if (action === "role") {
        const role = row.querySelector(".edit-user-role").value;

        if (!confirm("¿Confirmas cambiar el rol de esta cuenta?")) return;

        say("Guardando rol…");
        await invoke("set_role", { user_id: id, role });

        const refreshed = await loadUsers("Rol actualizado correctamente.");

        if (!refreshed) {
          say("El rol se guardó, pero no se pudo actualizar la lista.", true);
        }
      } else if (action === "active") {
        const active = button.dataset.active !== "true";

        if (!confirm(
          active ? "¿Activar esta cuenta?" : "¿Desactivar esta cuenta?"
        )) return;

        say(active ? "Activando usuario…" : "Desactivando usuario…");
        await invoke("set_active", { user_id: id, active });

        const refreshed = await loadUsers(
          active
            ? "Usuario activado correctamente."
            : "Usuario desactivado correctamente."
        );

        if (!refreshed) {
          say("El estado se guardó, pero no se pudo actualizar la lista.", true);
        }
      } else if (action === "password") {
        const password = prompt(
          "Escribe la nueva contraseña temporal (mínimo 8 caracteres):"
        );

        if (password === null) {
          say("Operación cancelada.");
          return;
        }

        if (password.length < 8) {
          say("La contraseña debe tener al menos 8 caracteres.", true);
          return;
        }

        if (!confirm("¿Confirmas restablecer esta contraseña?")) return;

        say("Restableciendo contraseña…");
        await invoke("reset_password", { user_id: id, password });
        say("Contraseña restablecida correctamente.");
      } else if (action === "delete") {
        const email = row.cells?.[0]?.textContent?.trim() || "esta cuenta";

        if (!confirm(
          `¿Eliminar definitivamente ${email}? Esta acción no se puede deshacer.`
        )) return;

        if (!confirm(
          "Confirmación final: se borrará la cuenta de acceso. ¿Continuar?"
        )) return;

        say("Eliminando cuenta…");
        await invoke("delete_user", { user_id: id });
        await loadUsers("Cuenta eliminada correctamente.");
      }
    } catch (e) {
      say("No se pudo completar la acción: " + e.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function initialize() {
    if (initializing) return;

    if (
      !cfg.supabaseUrl ||
      !cfg.supabaseAnonKey ||
      !window.supabase?.createClient
    ) {
      return;
    }

    initializing = true;

    try {
      if (!db) {
        db = window.supabase.createClient(
          cfg.supabaseUrl,
          cfg.supabaseAnonKey
        );
      }

      const { data, error } = await db.auth.getSession();
      const session = data?.session;

      if (error || !session?.user) {
        activeUserId = null;
        return;
      }

      if (
        activeUserId === session.user.id &&
        $("userManagementPanel") &&
        $("myAccountPanel")
      ) {
        return;
      }

      const { data: roleData, error: roleError } = await db
        .from("app_user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (roleError || roleData?.role !== "admin") return;

      activeUserId = session.user.id;

      addAccountPanel(session.user);
      addPanel();

      await loadUsers();
    } catch (e) {
      console.error("Gestión de usuarios:", e);
      say("Error al iniciar gestión de usuarios: " + e.message, true);
    } finally {
      initializing = false;
    }
  }

  function start() {
    initialize();
  }

  function watchLogin() {
    const app = $("app");

    if (app) {
      new MutationObserver(() => {
        if (!app.classList.contains("hidden")) start();
      }).observe(app, {
        attributes: true,
        attributeFilter: ["class"]
      });
    }

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) start();
    });

    window.addEventListener("focus", start);
    start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchLogin);
  } else {
    watchLogin();
  }
})();
 
