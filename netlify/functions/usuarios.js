// Gestión de usuarios y roles de Netlify Identity desde la propia página.
// Solo responde a usuarios con rol "administracion".
// Usa el token de administrador que Netlify entrega a la función
// (context.clientContext.identity), sin claves en el código.

function effectiveRoles(user) {
  let roles = (user.app_metadata && user.app_metadata.roles) || [];
  const email = (user.email || '').toLowerCase();
  const admins = (process.env.ADMIN_EMAILS || '')
    .toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (admins.includes(email) && roles.indexOf('administracion') < 0) {
    roles = roles.concat('administracion');
  }
  return roles;
}

export const handler = async (event, context) => {
  const headers = { 'Content-Type': 'application/json' };
  const user = context.clientContext && context.clientContext.user;
  const identity = context.clientContext && context.clientContext.identity;

  if (!user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };
  const roles = effectiveRoles(user);
  if (roles.indexOf('administracion') < 0) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Requiere rol administración' }) };
  }
  if (!identity || !identity.url || !identity.token) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Identity no disponible en la función' }) };
  }

  const base = identity.url; // p.ej. https://pasem.netlify.app/.netlify/identity
  const adminHeaders = { Authorization: 'Bearer ' + identity.token, 'Content-Type': 'application/json' };

  async function api(path, opts = {}) {
    const r = await fetch(base + path, { ...opts, headers: { ...adminHeaders, ...(opts.headers || {}) } });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
    if (!r.ok) throw new Error((data && (data.msg || data.error)) || ('HTTP ' + r.status));
    return data;
  }

  try {
    if (event.httpMethod === 'GET') {
      const data = await api('/admin/users');
      const users = (data.users || []).map((u) => ({
        id: u.id,
        email: u.email,
        roles: (u.app_metadata && u.app_metadata.roles) || [],
        confirmed: !!(u.confirmed_at || u.email_confirmed_at)
      }));
      return { statusCode: 200, headers, body: JSON.stringify(users) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const action = body.action;

      if (action === 'invite') {
        if (!body.email) throw new Error('Falta el correo');
        const role = body.role === 'administracion' ? 'administracion' : 'operacion';
        const inv = await api('/invite', { method: 'POST', body: JSON.stringify({ email: body.email }) });
        let uid = inv && inv.id;
        if (!uid) {
          const list = await api('/admin/users');
          const found = (list.users || []).find((u) => String(u.email).toLowerCase() === body.email.toLowerCase());
          uid = found && found.id;
        }
        if (uid) {
          await api('/admin/users/' + uid, { method: 'PUT', body: JSON.stringify({ app_metadata: { roles: [role] } }) });
        }
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      if (action === 'setrole') {
        if (!body.id) throw new Error('Falta id');
        const role = body.role === 'administracion' ? 'administracion' : 'operacion';
        await api('/admin/users/' + body.id, { method: 'PUT', body: JSON.stringify({ app_metadata: { roles: [role] } }) });
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      if (action === 'reset') {
        if (!body.email) throw new Error('Falta el correo');
        await api('/recover', { method: 'POST', body: JSON.stringify({ email: body.email }) });
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      if (action === 'delete') {
        if (!body.id) throw new Error('Falta id');
        await api('/admin/users/' + body.id, { method: 'DELETE' });
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      throw new Error('Acción no reconocida');
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e && e.message ? e.message : e) }) };
  }
};
