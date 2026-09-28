import { getStore } from '@netlify/blobs';

// Función protegida: solo responde si hay un usuario de Netlify Identity con sesión válida.
export const handler = async (event, context) => {
  const headers = { 'Content-Type': 'application/json' };

  // Netlify inyecta el usuario en context.clientContext.user cuando la petición
  // incluye el token de Identity en el encabezado Authorization: Bearer <token>.
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };
  }

  const store = getStore('pasem-atenciones');

  try {
    if (event.httpMethod === 'GET') {
      const { blobs } = await store.list();
      const items = await Promise.all(
        blobs.map((b) => store.get(b.key, { type: 'json' }))
      );
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
        capturadoPor: user.email || (user.user_metadata && user.user_metadata.full_name) || 'usuario'
      };
      await store.setJSON(id, record);
      return { statusCode: 200, headers, body: JSON.stringify(record) };
    }

    if (event.httpMethod === 'DELETE') {
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
