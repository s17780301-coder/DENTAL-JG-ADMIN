
/* DENTAL JG — Administración de usuarios
   JavaScript para el navegador. No es código de Supabase Edge Function. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const FUNCTION_NAME = 'administrar-usuarios';

  let db = null;
  let currentRole = '';

  const escapeHTML = value =>
    String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  function normalizeRole(value) {
    const role = String(value || '').toLowerCase().trim();

    if (['admin', 'administrator', 'administrador', 'owner'].includes(role)) {
      return 'admin';
    }

    if (['cobranza', 'collection', 'collector'].includes(role)) {
      return 'cobranza';
    }

    if ([
      'registro',
      'registrador',
      'registration',
      'registro_clientes'
    ].includes(role)) {
      return 'registro';
    }

    return '';
  }

  function showMessage(message, isError = false) {
    const element = $('userCreateMsg');

    if (element) {
      element.textContent = message;
      element.style.color = isError ? '#b42318' : '';
    }
  }

  function showNavigation(isAdmin) {
    document
      .querySelector('[data-view="register-users"]')
      ?.classList.toggle('hidden', !isAdmin);
  }

  async function invokeAdminFunction(action, fields = {}) {
    if (!db) {
      throw new Error(
        'No hay una sesión activa. Cierra sesión e inicia nuevamente.'
      );
    }

    const { data, error } = await db.functions.invoke(FUNCTION_NAME, {
      body: { action, ...fields }
    });

    if (error) {
      let message = error.message || 'Error en la función de usuarios.';

      try {
        const response = await error.context?.json?.();
        if (response?.error) message = response.error;
      } catch (_) {}

      throw new Error(message);
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data || {};
  }

  async function loadUsers() {
    if (currentRole !== 'admin') return;

    const tableBody = $('managedUsersRows');
    if (!tableBody) return;

    tableBody.innerHTML =
      '<tr><td colspan="5">Cargando usuarios…</td></tr>';

    try {
      const response = await invokeAdminFunction('list_users');
      const users = Array.isArray(response.users) ? response.users : [];

      tableBody.innerHTML = users.map(user => {
        const id = escapeHTML(user.id || user.user_id);
        const email = escapeHTML(user.email || 'Sin correo');
        const role = normalizeRole(user.role) || 'registro';
        const disabled = Boolean(user.disabled);

        return `
          <tr>
            <td>${email}</td>
            <td>
              <select data-role-id="${id}" aria-label="Rol de ${email}">
                <option value="registro" ${role === 'registro' ? 'selected' : ''}>
                  Registro de clientes
                </option>
                <option value="cobranza" ${role === 'cobranza' ? 'selected' : ''}>
                  Cobranza
                </option>
                <option value="admin" ${role === 'admin' ? 'selected' : ''}>
                  Administración
                </option>
              </select>
            </td>
            <td>${disabled ? 'Desactivada' : 'Activa'}</td>
            <td>${escapeHTML(user.last_sign_in_at || '—')}</td>
            <td>
              <button type="button" class="secondary"
                data-act="role" data-id="${id}">
                Guardar rol
              </button>

              <button type="button" class="secondary"
                data-act="active" data-id="${id}"
                data-active="${disabled}">
                ${disabled ? 'Activar' : 'Desactivar'}
              </button>

              <button type="button" class="secondary"
                data-act="password" data-id="${id}"
                data-email="${email}">
                Cambiar contraseña
              </button>
            </td>
          </tr>`;
      }).join('') ||
      '<tr><td colspan="5">No hay usuarios registrados.</td></tr>';

    } catch (error) {
      console.error('DENTAL JG — Cargar usuarios:', error);

      tableBody.innerHTML =
        '<tr><td colspan="5">No se pudieron cargar los usuarios.</td></tr>';

      showMessage(error.message, true);
    }
  }

  async function initializeSession(client, user) {
    db = client;
    currentRole = '';

    try {
      const { data, error } = await db
        .from('app_user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) throw error;

      const roles = (data || []).map(item => normalizeRole(item.role));
      currentRole = roles.includes('admin') ? 'admin' : '';

      showNavigation(currentRole === 'admin');

      if (currentRole === 'admin') {
        await loadUsers();
      }
    } catch (error) {
      console.error('DENTAL JG — Validación de permisos:', error);
      currentRole = '';
      showNavigation(false);
    }
  }

  /* app.js debe emitir este evento después de validar la sesión. */
  document.addEventListener('dentaljg:session-ready', event => {
    const detail = event.detail || {};

    if (detail.client && detail.user) {
      initializeSession(detail.client, detail.user);
    }
  });

  /* Crear usuario */
  $('userCreateForm')?.addEventListener('submit', async event => {
    event.preventDefault();

    if (currentRole !== 'admin') {
      showMessage('Solo Administración puede crear usuarios.', true);
      return;
    }

    const email = $('newUserEmail').value.trim().toLowerCase();
    const password = $('newUserPassword').value;
    const role = $('newUserRole').value;
    const button = $('createUserButton');

    if (password.length < 8) {
      showMessage('La contraseña debe tener al menos 8 caracteres.', true);
      return;
    }

    button.disabled = true;
    showMessage('Creando usuario…');

    try {
      await invokeAdminFunction('create_user', {
        email,
        password,
        role
      });

      $('userCreateForm').reset();
      showMessage('Usuario creado correctamente.');
      await loadUsers();

    } catch (error) {
      showMessage(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  /* Actualizar listado */
  $('usersRefresh')?.addEventListener('click', loadUsers);

  /* Cambiar rol, activar/desactivar o restablecer contraseña */
  $('managedUsersRows')?.addEventListener('click', async event => {
    const button = event.target.closest('button[data-act]');
    if (!button) return;

    if (currentRole !== 'admin') {
      showMessage('No tienes permisos para realizar esta acción.', true);
      return;
    }

    const id = button.dataset.id;
    const action = button.dataset.act;

    button.disabled = true;

    try {
      if (action === 'role') {
        const select = document.querySelector(
          `[data-role-id="${CSS.escape(id)}"]`
        );

        if (!select) throw new Error('No se encontró el selector de rol.');

        await invokeAdminFunction('set_role', {
          user_id: id,
          role: select.value
        });

        showMessage('Rol actualizado correctamente.');
        await loadUsers();

      } else if (action === 'active') {
        const currentlyDisabled = button.dataset.active === 'true';

        const confirmed = confirm(
          currentlyDisabled
            ? '¿Deseas activar esta cuenta?'
            : '¿Deseas desactivar esta cuenta?'
        );

        if (!confirmed) return;

        await invokeAdminFunction('set_active', {
          user_id: id,
          active: currentlyDisabled
        });

        showMessage('Estado de la cuenta actualizado.');
        await loadUsers();

      } else if (action === 'password') {
        const email = button.dataset.email || '';
        const password = prompt(
          `Nueva contraseña para ${email} (mínimo 8 caracteres):`
        );

        if (password === null) return;

        if (password.length < 8) {
          throw new Error(
            'La contraseña debe tener al menos 8 caracteres.'
          );
        }

        await invokeAdminFunction('reset_password', {
          user_id: id,
          password
        });

        showMessage('Contraseña restablecida correctamente.');
        alert('Contraseña restablecida correctamente.');
      }

    } catch (error) {
      console.error('DENTAL JG — Acción de usuario:', error);
      showMessage(error.message, true);
      alert(error.message);
    } finally {
      button.disabled = false;
    }
  });
})();
    
