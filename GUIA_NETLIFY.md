# Guía — Sitio PASEM con Administración, Usuarios y Roles en Netlify

El sitio incluye una sección **Administración** protegida por inicio de sesión, con:
- **Captura de autorizaciones** (formato PASEM) que se guardan en una **base de datos central**
  (todos los autorizados ven los mismos registros) y se pueden **exportar a CSV**.
- **Apartado Usuarios** (solo para rol Administración) para **invitar, cambiar rol, resetear
  contraseña y eliminar** usuarios, desde la propia página.

**Roles:**
- **administracion**: gestiona usuarios y hace todo con los registros (crear, ver, eliminar).
- **operacion**: captura y consulta registros (no elimina, no ve el apartado Usuarios).

Archivos del proyecto:
- index.html — sitio + seccion Administracion (captura, tabla, usuarios).
- netlify/functions/records.js — guarda/lee/borra autorizaciones (segun rol).
- netlify/functions/usuarios.js — invita/roles/reset/borra usuarios (solo administracion).
- netlify.toml, package.json — configuracion y dependencia de almacenamiento.

---

## Paso 1 — Subir a GitHub (ya hecho)
El repositorio ya tiene los archivos. Cuando cambie algo, sube el archivo nuevo con
**Add file -> Upload files** y **Commit**; Netlify vuelve a publicar solo.

## Paso 2 — Publicar en Netlify (ya hecho)
El sitio ya esta en linea (p. ej. pasem.netlify.app).

## Paso 3 — Activar el inicio de sesion (Netlify Identity)
1. En tu sitio -> **Site configuration -> Identity -> Enable Identity**.
2. **Registration** -> **Invite only** (solo por invitacion).

## Paso 4 — Definir el PRIMER administrador (importante)
Asignar roles requiere ya ser administrador, asi que el primero se "siembra" con una
variable de entorno:
1. Netlify -> **Site configuration -> Environment variables -> Add a variable**.
2. Key: ADMIN_EMAILS   Value: tu correo (varios separados por comas).
   Ejemplo: rodrigo@correo.com, jefatura@correo.com
3. **Save**. Luego **Deploys -> Trigger deploy -> Deploy site** para que tome la variable.

Cualquier correo listado en ADMIN_EMAILS entra como administracion automaticamente
(aunque no tenga rol guardado). Desde Usuarios podra invitar y dar rol a los demas.

## Paso 5 — Invitarte y entrar
1. En **Identity -> Invite users**, invita tu propio correo (el mismo de ADMIN_EMAILS).
2. Revisa tu correo y pon tu contrasena.
3. Abre el sitio -> menu **Administracion** -> **Iniciar sesion**.
4. Al entrar veras el formulario de captura y el apartado **Usuarios**.

## Paso 6 — Gestionar usuarios (rol administracion)
En **Usuarios y roles**:
- **Invitar usuario**: correo + rol (Operacion / Administracion) + enviar. La persona
  recibe correo para crear su contrasena; el rol queda asignado.
- **Cambiar rol**: menu desplegable de cada usuario.
- **Resetear contrasena**: envia el correo de restablecimiento.
- **Eliminar**: quita al usuario.

## Paso 7 — Uso diario (rol operacion)
Quien tenga rol operacion entra, llena el formulario y pulsa **Registrar atencion**.
Ve la tabla, pero no puede eliminar ni gestionar usuarios.

## Almacenamiento
Se usa **Netlify Blobs** (central, compartido). No requiere configuracion; el almacen
"pasem-atenciones" se crea solo con el primer registro. Respalda con **Exportar CSV**.

---

## Solucion de problemas
- "Iniciar sesion" no hace nada -> Identity no esta habilitado (Paso 3).
- Entra pero dice "Sin rol asignado" -> asigna rol desde Usuarios, o pon el correo en
  ADMIN_EMAILS si debe ser admin (re-despliega tras cambiar la variable).
- Error al invitar/gestionar usuarios (403) -> la cuenta no es administracion.
- Error 500 al guardar -> comparte el texto exacto y se revisa.

## Seguridad
- El acceso lo controla Netlify Identity; solo entra quien invites.
- Las acciones sensibles (usuarios, eliminar) se validan en el servidor, no solo en pantalla.
