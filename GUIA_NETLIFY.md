# Guía para publicar el sitio PASEM con panel de Administración en Netlify

Este proyecto es el sitio de PASEM **más** una sección de **Administración** protegida por
inicio de sesión, con una **base de datos central** donde se guardan las atenciones
autorizadas (todos los usuarios autorizados ven los mismos registros).

Piezas incluidas:
- `index.html` — el sitio completo + la sección **Administración**.
- `netlify/functions/records.js` — función de servidor que guarda / lee / borra las atenciones.
- `netlify.toml` — configuración de Netlify.
- `package.json` — dependencia del almacenamiento (Netlify Blobs).

> Importante: por usar funciones de servidor, este proyecto se publica **conectando un
> repositorio de GitHub** (el método de "arrastrar archivos" no maneja funciones).

---

## Paso 1 — Crear cuentas (si no las tienes)
1. Cuenta gratuita en **GitHub**: https://github.com
2. Cuenta gratuita en **Netlify**: https://app.netlify.com (puedes entrar con tu GitHub).

## Paso 2 — Subir el proyecto a GitHub
Opción sencilla (por la web):
1. En GitHub: **New repository** → nombre p. ej. `pasem-sitio` → **Create repository**.
2. En la página del repo: **Add file → Upload files**.
3. Arrastra **todo el contenido de esta carpeta** respetando la estructura
   (el archivo `index.html`, el archivo `netlify.toml`, `package.json`, y la carpeta
   `netlify/` con `functions/records.js` dentro). 
   - Consejo: arrastra la carpeta `netlify` completa para que conserve la ruta
     `netlify/functions/records.js`.
4. Escribe un mensaje y pulsa **Commit changes**.

## Paso 3 — Conectar el repo con Netlify
1. En Netlify: **Add new site → Import an existing project → GitHub**.
2. Autoriza y elige el repositorio `pasem-sitio`.
3. Deja los valores por defecto (no hay comando de build; *Publish directory* = `.`).
4. **Deploy site**. En un minuto tendrás una URL tipo `https://algo-aleatorio.netlify.app`.

## Paso 4 — Activar el inicio de sesión (Netlify Identity)
1. En tu sitio → **Site configuration → Identity → Enable Identity**.
2. En **Registration**: elige **Invite only** (solo por invitación), para que nadie ajeno
   pueda crearse cuenta.
3. En **Identity → Invite users**: escribe el correo de cada persona autorizada e invítala.
   Cada quien recibirá un correo para poner su contraseña.
4. (Recomendado) En **Identity → Emails** puedes personalizar los correos de invitación.

> El botón "Iniciar sesión" de la sección Administración usa este Identity. Si un usuario
> no fue invitado, no podrá entrar.

## Paso 5 — Almacenamiento de datos (Netlify Blobs)
No requiere configuración: **Netlify Blobs** se activa solo para las funciones. La primera
vez que registres una atención se crea el almacén `pasem-atenciones` automáticamente.

## Paso 6 — Probar
1. Abre tu sitio, baja hasta **Administración** (o usa el enlace "Acceso administración"
   del pie de página).
2. **Iniciar sesión** con una cuenta invitada.
3. Captura una atención y pulsa **Registrar atención**: aparecerá en la tabla.
4. Abre el sitio en otra computadora / con otra cuenta autorizada: verás **los mismos** registros.
5. **Exportar CSV** descarga todos los registros para abrirlos en Excel.

## Cambiar el nombre del sitio / dominio
- **Site configuration → Change site name** → p. ej. `pasem-seccion26`
  (tu URL será `https://pasem-seccion26.netlify.app`).
- Si tienes dominio propio: **Domain management → Add a domain**.

## Actualizar el sitio más adelante
Cada vez que cambie el `index.html` (o cualquier archivo), súbelo al repositorio de GitHub
(**Add file → Upload files** y *Commit*). Netlify **vuelve a publicar solo** en segundos.

---

## Notas
- **Seguridad del acceso**: el inicio de sesión es real (Identity). Solo entra quien invites.
- **Los datos** viven en Netlify Blobs (central y compartido). Haz respaldos periódicos con
  **Exportar CSV**.
- **PDF y formularios de Google** de la sección Formatos siguen siendo enlaces externos;
  verifica que el PDF en Drive esté como "Cualquiera con el enlace → Lector".
- Si algún día quieres **campos distintos** en la captura, se editan en `index.html`
  (sección `id="administracion"`) y en la tabla; avísame y lo ajusto.
