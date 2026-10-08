# PASEM — Documento de traspaso (handoff)

Este documento resume TODO el proyecto para poder retomarlo en otra IA o con otra
persona sin contexto previo. Acompáñalo del ZIP del proyecto (código completo).

## 1. Qué es
Sitio web del **PASEM** (Programa de Apoyo de Servicios Médicos) del **SNTE Sección 26**,
nivel **Telesecundaria**, San Luis Potosí. Administrado por **MULTICATERIN, S.A. de C.V.**
con respaldo de **BIDA Seguros**.
- NO es un seguro ni póliza; es "apoyo económico / coordinación de servicios médicos".
- Sitio público informativo + un panel privado de **Administración** (/admin).
- Dominio: **pasem.com** (GoDaddy, DNS apuntando a Netlify; correo Google Workspace intacto).
- Hosting: **Netlify**, desplegado desde **GitHub** (repo pasembida/pasem-sitio).

## 2. Stack y arquitectura
- Frontend: HTML/CSS/JS puro (sin framework). Dos páginas:
  - `index.html` — sitio público (una sola página con secciones).
  - `admin.html` — panel privado, servido en `/admin` (regla en netlify.toml).
- Backend: **Netlify Functions** (Node, ESM) en `netlify/functions/`.
- Almacenamiento: **Netlify Blobs** (clave-valor) + un archivo estático JSON de titulares.
- Autenticación: PROPIA (no Netlify Identity). Login con correo+contraseña; el servidor
  firma un **JWT HS256** con `SESSION_SECRET`; el cliente lo guarda en localStorage y lo
  manda como `Authorization: Bearer <token>`. Contraseñas con **scrypt** (hash+salt).

## 3. Paleta / diseño
- Naranja PASEM `#DD6B20`, Turquesa `#14B4B6`, Gris oscuro `#333`, Gris medio `#767676`,
  Blanco `#FFFFFF`. Secciones alternas en turquesa muy claro. "PASEM" en Arial negra.
- Tipografías: Cambria (títulos), Calibri (cuerpo).
- Entradas de texto del panel: se fuerzan a MAYÚSCULAS sin acentos (conservando la Ñ).

## 4. Variables de entorno (Netlify → Site configuration → Environment variables)
Todas "All scopes", "Same value for all deploy contexts", sin marcar secret:
- `SESSION_SECRET` — frase larga aleatoria para firmar sesiones.
- `SEED_ADMIN_EMAIL` — correo del primer administrador (ej. rodrigoperez@bidaseguros.org).
- `SEED_ADMIN_PASSWORD` — contraseña inicial del admin (auth.js la sincroniza si cambia).
- `NETLIFY_SITE_ID` — Project ID de Netlify (ej. e38d9e11-1e7f-4240-8ef0-b456e08df01b).
- `NETLIFY_API_TOKEN` — Personal Access Token de Netlify (necesario para que las funciones
  escriban/lean en Blobs: makeStore usa siteID+token).

## 5. Funciones (netlify/functions/)
Todas verifican el JWT y el rol (administracion u operacion); varias acciones son
solo-admin. Usan `makeStore(name)` = getStore con siteID+token.
- `auth.js` — POST login (siembra/sincroniza admin desde SEED_*), POST change (cambiar
  contraseña propia). Exporta verify() del JWT.
- `records.js` — ATENCIONES (store `pasem-atenciones`). GET lista, POST crea (guarda todos
  los campos del formulario de autorización + solicitudId + certificado), POST action
  'notify' (sella notifiedAt), DELETE (solo admin).
- `usuarios.js` — gestión de usuarios (store `pasem-usuarios`). Solo admin. list/create/
  setrole/setpassword/delete.
- `beneficiarios.js` — CONSULTA. Lee el JSON estático de titulares + fusiona titulares
  nuevos (`pasem-titulares`) + dependientes (`pasem-dependientes`). GET ?q= busca por
  nombre/RFC/CURP/certificado. Devuelve cert, tipo (Titular/Dependiente), etc.
- `solicitudes.js` — SOLICITUD DE SERVICIO (store `pasem-solicitudes`). create (genera
  folio automático = CERT-CODIGO-###, ver §7), stage (sella etapa 1-4), authorize
  (marca autorizada + etapa 3), list, delete.
- `dependientes.js` — ALTA DE DEPENDIENTES (store `pasem-dependientes`). create (asigna
  certificado del titular + letra A/B/C… siguiente libre), list, delete.
- `titulares.js` — ALTA DE TITULARES (store `pasem-titulares`). create (asigna el siguiente
  certificado PASEM-#####, continuando después del máximo del JSON estático = 3457), list,
  delete. Importa beneficiarios.json solo para conocer ese máximo.
- `expediente.js` — EXPEDIENTES/DOCUMENTOS (store `pasem-expedientes`). Subida/descarga
  POR PARTES (chunks) para soportar hasta 15 MB pese al límite de ~6 MB por invocación:
  - meta:<id> (JSON con filename, mime, ref=certificado, desc, chunks, etc.)
  - chunk:<id>:<i> (texto base64 de cada parte)
  Acciones: chunk, finalize, upload (1 parte), delete. GET lista / GET ?id (meta) /
  GET ?id&chunk=i (parte).

## 6. Datos (Netlify Blobs) — stores
- `pasem-usuarios`  (clave = correo): {email,salt,hash,role,createdAt}
- `pasem-atenciones` (clave = id PASEM-...): todos los campos del formato + solicitudId,
  certificado, capturadoPor, createdAt, notifiedAt/notifiedBy
- `pasem-solicitudes` (clave = id SOL-...): folio, folioEleonor, nombre, rfc, curp,
  certificado, tipoTramite, comentarios, estado, etapas{1..4:fecha}, autorizada, atencionId
- `pasem-dependientes` (clave = id DEP-...): cert (titularCert+letra), titularCert,
  titularNombre, nombre, parentesco, curp, rfc, createdAt
- `pasem-titulares` (clave = id TIT-...): cert (PASEM-#####), nombre, curp, rfc, funcion,
  cct, ct, nivel, createdAt
- `pasem-expedientes`: meta:<id> + chunk:<id>:<i> (documentos, ref=certificado)

Archivo estático: `netlify/functions/lib/beneficiarios.json` — 3457 titulares. Claves:
n=nombre, r=RFC, c=CURP, k=clave presupuestal, f=función, cct, t=centro de trabajo,
nv=nivel, ce=certificado (PASEM-00001…03457).

## 7. Reglas de negocio clave
- **Certificados**: titulares del Excel = PASEM-00001…03457. Titulares nuevos continúan
  (03458…). Dependientes = certificado del titular + letra (PASEM-00001A, 00001B…).
- **Folio de control** (automático, solo lectura): `CERTIFICADO-CODIGO-CONSECUTIVO`
  (ej. PASEM-00001-CIR-001 / PASEM-00001A-CIR-001). Único e irrepetible (consecutivo por
  certificado+tipo, con blindaje anti-colisión). Códigos de tipo:
  CIR=Cirugía, PAR=Apoyo Parto o Cesárea, CGE=Consulta Médico General,
  CES=Consulta Especialista, LAB=Estudio Laboratorio.
- **Roles**: administracion (todo) y operacion (captura/consulta, no elimina, no ve Usuarios).
- **Flujo**: Solicitud de servicio → (etapas/notificaciones) → Autorización (arrastra datos
  de la solicitud y completa el formato) → Atenciones registradas.
- **Etapas con correo** (mailto, abre el correo ya redactado a
  **telesecundariaseccion26@pasem.com** y sella la fecha):
  1 Solicitud de atención · 2 Solicitud de documentación · 3 Autorización generada
  (automática al autorizar) · 4 Servicio otorgado.
- **Documentos/expediente**: se adjuntan en Solicitud, Autorización, Alta de dependiente y
  Alta de titular; se asocian por CERTIFICADO; se consultan juntos desde el icono 📎 en
  Consulta de beneficiarios y en los listados. Se ACUMULAN (no se reemplazan). Máx 15 MB.

## 8. Panel /admin — pestañas
Solicitud de servicio · Autorización · Consulta de beneficiarios · Alta titular ·
Dependientes · Descargas · Expediente · Usuarios (solo admin).

## 9. Despliegue
1. Subir el contenido del repo a GitHub (pasembida/pasem-sitio), respetando carpetas.
2. Netlify desplegado desde ese repo (publish ".", functions "netlify/functions",
   bundler esbuild). netlify.toml incluye redirect /admin -> /admin.html.
3. Crear las 5 variables de entorno (§4). Redesplegar (Clear cache and deploy).
4. Dominio pasem.com en GoDaddy: A @ -> 75.2.60.5 ; CNAME www -> pasem.netlify.app.
   NO tocar MX/TXT (correo Google). HTTPS lo emite Netlify solo.

## 10. Limitaciones conocidas / pendientes
- El correo de etapas/notificación usa **mailto** (abre el cliente de correo del usuario
  para dar "Enviar"); no es envío automático desde servidor. Para envío automático real se
  integraría un servicio (Resend/SendGrid) con API key.
- Teléfono Centro de Contacto y domicilio/horario de Telesecundaria: revisar si faltan datos.
- No hay exportación directa a JSON/CSV de los stores de Blobs desde el panel (se puede
  agregar). Lo capturado en Blobs no está en archivos del repo (es dinámico).
- "Expediente en un mismo archivo": hoy se muestran todos los documentos juntos por
  beneficiario; NO se fusionan en un único PDF (se podría agregar).

## 11. Pruebas
Se validó con un backend simulado (Playwright + rutas mock) todo el flujo: login, solicitud
con folio automático, etapas, autorización (arrastre y guardado), alta de titular y de
dependiente con certificado, consulta (titulares + dependientes + nuevos), expediente por
partes (subida/descarga 15 MB) y adjuntos en cada formulario. Sin errores de consola ni IDs
duplicados.
