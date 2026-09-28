import { getStore } from '@netlify/blobs';

// Roles efectivos: los guardados en el usuario + "administracion" si su correo
// está en la variable de entorno ADMIN_EMAILS (para sembrar al primer admin).
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
  if (!user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };

  const roles = effectiveRoles(user);
  const isAdmin = roles.indexOf('administracion') >= 0;
  const canUse = isAdmin || roles.indexOf('operacion') >= 0;
  if (!canUse) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Sin rol asignado' }) };

  const store = getStore('pasem-atenciones');

  try {
    if (event.httpMethod === 'GET') {
      const { blobs } = await store.list();
      const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));
      const clean = items.filter(Boolean);
      clean.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return { statusCode: 200, headers, body: JSON.stringify(clean) };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      const id = 'PASEM-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
      const record = {
        ...data,
        id,
        createdAt: new Date().toISOString(),
        capturadoPor: user.email || 'usuario'
      };
      await store.setJSON(id, record);
      return { statusCode: 200, headers, body: JSON.stringify(record) };
    }

    if (event.httpMethod === 'DELETE') {
      if (!isAdmin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo administración puede eliminar' }) };
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta id' }) };
      await store.delete(id);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e && e.message ? e.message : e) }) };
  }
};
