
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
"https://s17780301-coder.github.io",
]);

function corsHeadersFor(req: Request) {
const origin = req.headers.get("Origin") ?? "";
const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "null";

return {
"Access-Control-Allow-Origin": allowedOrigin,
"Access-Control-Allow-Headers":
"authorization, x-client-info, apikey, content-type",
"Access-Control-Allow-Methods": "POST, OPTIONS",
"Vary": "Origin",
};
}

function jsonResponse(
req: Request,
body: unknown,
status = 200,
) {
return new Response(JSON.stringify(body), {
status,
headers: {
...corsHeadersFor(req),
"Content-Type": "application/json",
},
});
}

// Admite una clave simple o un objeto JSON con una clave "default".
function readNamedKey(envName: string): string | null {
const raw = Deno.env.get(envName);
if (!raw) return null;

try {
const parsed = JSON.parse(raw);

if (
parsed &&
typeof parsed === "object" &&
typeof parsed.default === "string"
) {
return parsed.default;
}
} catch {
return raw;
}

return null;
}

Deno.serve(async (req: Request) => {
if (req.method === "OPTIONS") {
return new Response("ok", {
headers: corsHeadersFor(req),
});
}

const origin = req.headers.get("Origin");

if (origin && !ALLOWED_ORIGINS.has(origin)) {
return jsonResponse(
req,
{ error: "Origen no autorizado." },
403,
);
}

if (req.method !== "POST") {
return jsonResponse(
req,
{ error: "Usa una solicitud POST." },
405,
);
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");

const anonKey =
readNamedKey("SUPABASE_PUBLISHABLE_KEYS") ??
Deno.env.get("SUPABASE_ANON_KEY");

const serviceRoleKey =
readNamedKey("SUPABASE_SECRET_KEYS") ??
Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
return jsonResponse(
req,
{
error:
"Faltan variables necesarias en el entorno de Supabase. Verifica los nombres y formatos de las claves en Secrets. No pegues claves privadas en el código.",
},
500,
);
}

const authorization = req.headers.get("Authorization");

if (!authorization?.startsWith("Bearer ")) {
return jsonResponse(
req,
{ error: "Debes iniciar sesión como administrador." },
401,
);
}

// Verifica la sesión de quien realiza la solicitud.
const callerClient = createClient(
supabaseUrl,
anonKey,
{
global: {
headers: { Authorization: authorization },
},
auth: {
persistSession: false,
autoRefreshToken: false,
},
},
);

const { data: callerData, error: callerError } =
await callerClient.auth.getUser();

if (callerError || !callerData.user) {
return jsonResponse(
req,
{
error:
"La sesión no es válida. Inicia sesión nuevamente.",
},
401,
);
}

// La clave privilegiada solo se usa dentro del servidor.
const adminClient = createClient(
supabaseUrl,
serviceRoleKey,
{
auth: {
persistSession: false,
autoRefreshToken: false,
},
},
);

// Solo el rol admin puede administrar cuentas.
const { data: roleRow, error: roleError } =
await adminClient
.from("app_user_roles")
.select("role")
.eq("user_id", callerData.user.id)
.maybeSingle();

if (roleError) {
return jsonResponse(
req,
{ error: "No se pudo comprobar el rol del administrador." },
500,
);
}

if (
!roleRow ||
String(roleRow.role).trim().toLowerCase() !== "admin"
) {
return jsonResponse(
req,
{
error:
"Acceso denegado: solo Administración puede gestionar cuentas.",
},
403,
);
}

let body: Record<string, unknown>;

try {
body = await req.json();
} catch {
return jsonResponse(
req,
{ error: "El cuerpo de la solicitud no contiene JSON válido." },
400,
);
}

const action = String(body.action ?? "");

// LISTAR CUENTAS
if (action === "list_users") {
const { data: usersData, error: usersError } =
await adminClient.auth.admin.listUsers({
page: 1,
perPage: 1000,
});

if (usersError) {
return jsonResponse(
req,
{ error: "No se pudieron consultar las cuentas." },
500,
);
}

const { data: roles, error: rolesError } =
await adminClient
.from("app_user_roles")
.select("user_id, role, created_at");

if (rolesError) {
return jsonResponse(
req,
{ error: "No se pudieron consultar los permisos." },
500,
);
}

const roleByUser = new Map(
(roles ?? []).map((r) => [r.user_id, r.role]),
);

const users = (usersData.users ?? []).map((u) => ({
id: u.id,
email: u.email ?? "",
created_at: u.created_at,
last_sign_in_at: u.last_sign_in_at ?? null,
disabled: Boolean(
u.banned_until &&
new Date(u.banned_until).getTime() > Date.now()
),
role: roleByUser.get(u.id) ?? "sin_asignar",
}));

return jsonResponse(req, {
users,
note: "Se muestran hasta 1000 cuentas por consulta.",
});
}

// CREAR CUENTA
if (action === "create_user") {
const email = String(body.email ?? "")
.trim()
.toLowerCase();

const password = String(body.password ?? "");

const role = String(body.role ?? "")
.trim()
.toLowerCase();

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
return jsonResponse(
req,
{ error: "Escribe un correo electrónico válido." },
400,
);
}

if (password.length < 8) {
return jsonResponse(
req,
{
error:
"La contraseña inicial debe tener al menos 8 caracteres.",
},
400,
);
}

if (!["admin", "cobranza", "registro"].includes(role)) {
return jsonResponse(
req,
{
error:
"Rol no válido. Usa admin, cobranza o registro.",
},
400,
);
}

const { data: created, error: createError } =
await adminClient.auth.admin.createUser({
email,
password,
email_confirm: true,
});

if (createError || !created.user) {
return jsonResponse(
req,
{
error:
createError?.message ??
"No se pudo crear la cuenta.",
},
400,
);
}

const { error: roleInsertError } =
await adminClient
.from("app_user_roles")
.insert({
user_id: created.user.id,
role,
});

if (roleInsertError) {
await adminClient.auth.admin.deleteUser(
created.user.id,
);

return jsonResponse(
req,
{
error:
"No se pudo asignar el rol. Se intentó cancelar la creación de la cuenta.",
},
500,
);
}

return jsonResponse(
req,
{
message: "Cuenta creada y rol asignado.",
user: {
id: created.user.id,
email: created.user.email,
role,
},
},
201,
);
}

// CAMBIAR ROL
if (action === "set_role") {
const userId = String(body.user_id ?? "");

const role = String(body.role ?? "")
.trim()
.toLowerCase();

if (!userId) {
return jsonResponse(
req,
{ error: "Falta user_id." },
400,
);
}

if (!["admin", "cobranza", "registro"].includes(role)) {
return jsonResponse(
req,
{ error: "Rol no válido." },
400,
);
}

const { data: targetUserData, error: targetUserError } =
await adminClient.auth.admin.getUserById(userId);

if (targetUserError || !targetUserData.user) {
return jsonResponse(
req,
{ error: "La cuenta indicada no existe." },
404,
);
}

const { data: currentTargetRole, error: currentRoleError } =
await adminClient
.from("app_user_roles")
.select("role")
.eq("user_id", userId)
.maybeSingle();

if (currentRoleError) {
return jsonResponse(
req,
{ error: "No se pudo consultar el rol actual." },
500,
);
}

if (
currentTargetRole?.role === "admin" &&
role !== "admin"
) {
const { count, error: countError } =
await adminClient
.from("app_user_roles")
.select("user_id", {
count: "exact",
head: true,
})
.eq("role", "admin");

if (countError) {
return jsonResponse(
req,
{
error:
"No se pudo verificar cuántos administradores existen.",
},
500,
);
}

if ((count ?? 0) <= 1) {
return jsonResponse(
req,
{
error:
"No puedes quitar el rol al último administrador.",
},
400,
);
}
}

if (
userId === callerData.user.id &&
role !== "admin"
) {
return jsonResponse(
req,
{
error:
"No puedes quitarte a ti mismo el rol de administrador.",
},
400,
);
}

let saveRoleError: { message?: string } | null = null;

if (currentTargetRole?.role) {
// La tabla tiene una llave primaria compuesta (user_id, role).
// Actualizamos la fila del rol actual en vez de hacer upsert por user_id.
const { error } = await adminClient
.from("app_user_roles")
.update({ role })
.eq("user_id", userId)
.eq("role", currentTargetRole.role);
saveRoleError = error;
} else {
// Solo insertamos si la cuenta todavía no tiene un rol asignado.
const { error } = await adminClient
.from("app_user_roles")
.insert({ user_id: userId, role });
saveRoleError = error;
}

if (saveRoleError) {
console.error("set_role: no se pudo guardar el rol", saveRoleError);
return jsonResponse(
req,
{ error: saveRoleError.message || "No se pudo guardar el rol." },
500,
);
}

return jsonResponse(req, {
message: "Rol actualizado.",
});
}

// ACTIVAR O DESACTIVAR CUENTA
if (action === "set_active") {
const userId = String(body.user_id ?? "");
const active = body.active;

if (!userId || typeof active !== "boolean") {
return jsonResponse(
req,
{
error:
"Indica user_id y active como true o false.",
},
400,
);
}

if (
userId === callerData.user.id &&
active === false
) {
return jsonResponse(
req,
{
error:
"No puedes desactivar tu propia cuenta desde esta función.",
},
400,
);
}

const { data: targetBefore, error: targetBeforeError } =
await adminClient.auth.admin.getUserById(userId);

if (targetBeforeError || !targetBefore.user) {
return jsonResponse(
req,
{ error: "La cuenta indicada no existe." },
404,
);
}

if (active === false) {
const { data: targetRole, error: targetRoleError } =
await adminClient
.from("app_user_roles")
.select("role")
.eq("user_id", userId)
.maybeSingle();

if (targetRoleError) {
return jsonResponse(
req,
{ error: "No se pudo consultar el rol de la cuenta." },
500,
);
}

if (targetRole?.role === "admin") {
const { count, error: countError } =
await adminClient
.from("app_user_roles")
.select("user_id", {
count: "exact",
head: true,
})
.eq("role", "admin");

if (countError) {
return jsonResponse(
req,
{
error:
"No se pudo verificar cuántos administradores existen.",
},
500,
);
}

if ((count ?? 0) <= 1) {
return jsonResponse(
req,
{
error:
"No puedes desactivar al último administrador.",
},
400,
);
}
}
}

const { data: target, error: updateError } =
await adminClient.auth.admin.updateUserById(
userId,
{
ban_duration: active ? "none" : "876000h",
},
);

if (updateError || !target.user) {
return jsonResponse(
req,
{
error:
updateError?.message ??
"No se pudo actualizar la cuenta.",
},
400,
);
}

return jsonResponse(req, {
message: active
? "Cuenta activada."
: "Cuenta desactivada.",
});
}

// RESTABLECER CONTRASEÑA
if (action === "reset_password") {
const userId = String(body.user_id ?? "");
const password = String(body.password ?? "");

if (!userId) {
return jsonResponse(
req,
{ error: "Falta user_id." },
400,
);
}

if (password.length < 8) {
return jsonResponse(
req,
{
error:
"La nueva contraseña debe tener al menos 8 caracteres.",
},
400,
);
}

const { data: resetTarget, error: resetTargetError } =
await adminClient.auth.admin.getUserById(userId);

if (resetTargetError || !resetTarget.user) {
return jsonResponse(
req,
{ error: "La cuenta indicada no existe." },
404,
);
}

const { error } = await adminClient.auth.admin.updateUserById(
userId,
{ password },
);

if (error) {
return jsonResponse(
req,
{ error: "No se pudo restablecer la contraseña." },
400,
);
}

return jsonResponse(req, {
message:
"Contraseña restablecida. Entrégala por un canal privado y pide al usuario cambiarla.",
});
}

return jsonResponse(
req,
{
error: "Acción no reconocida.",
actions: [
"list_users",
"create_user",
"set_role",
"set_active",
"reset_password",
],
},
400,
);
});
  
