# Guía — Sitio PASEM con Administración (login propio, usuarios y roles)

Acceso con **correo y contraseña** definidos por ti (sin correos de invitación ni tokens,
sin depender de servicios externos). Roles:
- **administracion**: gestiona usuarios y hace todo con los registros (crear, ver, eliminar).
- **operacion**: captura y consulta registros (no elimina, no ve el apartado Usuarios).

Archivos del proyecto:
- index.html — sitio + seccion Administracion (login, captura, tabla, usuarios).
- netlify/functions/auth.js — inicio de sesion y cambio de contrasena.
- netlify/functions/records.js — guarda/lee/borra autorizaciones (segun rol).
- netlify/functions/usuarios.js — crear/rol/contrasena/eliminar usuarios (solo admin).
- netlify.toml, package.json — configuracion y dependencia de almacenamiento.

---

## Paso 1 — Subir a GitHub
Sube TODOS los archivos (index.html, netlify.toml, package.json y la carpeta netlify con
sus tres funciones) reemplazando los anteriores. Con Add file -> Upload files y Commit.

## Paso 2 — Variables de entorno en Netlify (IMPORTANTE)
En Netlify -> Site configuration -> Environment variables -> Add a variable. Crea TRES:

1. Key: SESSION_SECRET
   Value: una frase larga y aleatoria (invéntala; solo se usa internamente).
   Ejemplo: pasem-2026-clave-larga-9f3k2m7q1z

2. Key: SEED_ADMIN_EMAIL
   Value: tu correo de administrador. Ej: rodrigoperez@bidaseguros.org

3. Key: SEED_ADMIN_PASSWORD
   Value: la contrasena con la que entraras la primera vez (mínimo 6 caracteres).

Deja "All scopes" y "Same value for all deploy contexts". Guarda cada una.
(Ya NO se usa ADMIN_EMAILS; puedes borrarla.)

## Paso 3 — Desplegar
Deploys -> Trigger deploy -> Clear cache and deploy site. Espera a que diga "Published".
(La app crea sola tu usuario administrador con el correo y contrasena de arriba en el
primer inicio de sesion.)

## Paso 4 — Entrar
1. Abre el sitio -> menu Administracion -> escribe tu correo (SEED_ADMIN_EMAIL) y tu
   contrasena (SEED_ADMIN_PASSWORD) -> Entrar.
2. Veras el formulario de captura y el apartado Usuarios y roles.

## Paso 5 — Crear usuarios (rol administracion)
En "Usuarios y roles":
- Crear usuario: correo + rol + contrasena temporal -> Crear. Comparte esa contrasena con
  la persona (puede cambiarla al entrar con "Cambiar mi contrasena").
- Cambiar rol: menu desplegable de cada usuario.
- Cambiar contrasena: define una nueva para ese usuario.
- Eliminar: quita al usuario.

## Paso 6 — Uso diario
- Operacion: entra, llena el formulario y Registrar atencion. Ve la tabla (sin eliminar).
- Administracion: ademas puede eliminar registros y gestionar usuarios.
- Exportar CSV: descarga todos los registros para Excel.

## Nota sobre Netlify Identity
Ya NO se usa. Puedes dejar Identity desactivado. Esto evita los problemas de invitaciones
por correo y de bloqueo del widget por extensiones del navegador.

---

## Seguridad
- Las contrasenas se guardan cifradas (hash scrypt), nunca en texto plano.
- La sesion usa un token firmado (con SESSION_SECRET). Cambia ese valor si sospechas
  que se filtro.
- Las acciones sensibles se validan en el servidor (funciones), no solo en pantalla.

## Solucion de problemas
- "Correo o contrasena incorrectos" al primer intento -> revisa que SEED_ADMIN_EMAIL y
  SEED_ADMIN_PASSWORD esten bien escritos y que hiciste un nuevo deploy tras crearlas.
- Error 500 -> comparte el texto exacto y se revisa.
