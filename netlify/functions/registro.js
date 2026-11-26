import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }
const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function verify(token){ if(!token) return null; const p=token.split('.'); if(p.length!==3) return null; const data=p[0]+'.'+p[1]; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); if(sig!==p[2]) return null; let o; try{ o=JSON.parse(Buffer.from(p[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; } if(o.exp&&Math.floor(Date.now()/1000)>o.exp) return null; return o; }
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

export const handler = async (event) => {
  const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*'};
  const store=makeStore('pasem-registros');

  // ---- GET: lista para administración ----
  if(event.httpMethod==='GET'){
    const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
    if(!p || !(p.role==='administracion'||p.role==='operacion')) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
    try{
      const {blobs}=await store.list();
      const items=(await Promise.all(blobs.filter(b=>b.key.indexOf('reg:')===0).map(b=>store.get(b.key,{type:'json'})))).filter(Boolean);
      items.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      return {statusCode:200,headers,body:JSON.stringify(items)};
    }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
  }

  if(event.httpMethod!=='POST') return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};

  let body={}; try{ body=JSON.parse(event.body||'{}'); }catch(e){ return {statusCode:400,headers,body:JSON.stringify({error:'JSON inválido'})}; }

  // ---- POST público: crear registro ----
  if(!body.action || body.action==='create'){
    if(body['bot-field']) return {statusCode:200,headers,body:JSON.stringify({ok:true})}; // honeypot
    const f=body.fields||{};
    const docs=Array.isArray(body.docs)?body.docs:[];
    const nombre=String(f['Nombre completo']||'').trim();
    const curp=String(f['CURP']||'').trim().toUpperCase();
    const correo=String(f['Correo electrónico']||'').trim();
    const modalidad=String(f['Modalidad']||'').trim();
    if(!nombre || !curp) return {statusCode:400,headers,body:JSON.stringify({error:'Faltan datos del titular (nombre y CURP).'})};
    const id=crypto.randomUUID();
    const rec={ id, createdAt:new Date().toISOString(), estado:'recibido', fields:f, docs, modalidad, curp, programa:'telesecundaria' };
    await store.setJSON('reg:'+id, rec);

    // Correo de confirmación al maestro
    const key=process.env.RESEND_API_KEY;
    let correoEnviado=false;
    if(key && correo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)){
      try{
        const base=(process.env.SITE_URL||'https://pasem.com').replace(/\/$/,'');
        const snte=base+'/img/snte26.jpg', bida=base+'/img/bida.png';
        const html='<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#EAF6F6;font-family:Arial,Helvetica,sans-serif;color:#1f3442;">'+
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF6F6;padding:20px 10px;"><tr><td align="center">'+
          '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #D9E9E9;border-radius:12px;overflow:hidden;">'+
            '<tr><td style="padding:14px 18px;"><table role="presentation" width="100%"><tr><td align="left"><img src="'+snte+'" height="42"></td><td align="right"><img src="'+bida+'" height="42"></td></tr></table></td></tr>'+
            '<tr><td style="background:#0E9A9C;padding:16px 18px;text-align:center;color:#fff;font-size:19px;font-weight:800;">Recibimos tu registro al PASEM</td></tr>'+
            '<tr><td style="height:4px;background:#14B4B6;font-size:0;line-height:0;">&nbsp;</td></tr>'+
            '<tr><td style="padding:20px 22px;font-size:15px;line-height:1.7;color:#1f3442;">'+
              (nombre?('Estimado(a) <b>'+esc(nombre)+'</b>,<br><br>'):'¡Hola!<br><br>')+
              'Hemos recibido tu <b>registro de afiliación al PASEM</b> y los documentos que adjuntaste ('+docs.length+').<br><br>'+
              'A continuación realizaremos la <b>revisión de tus documentos</b>. Una vez revisados, recibirás una nueva notificación indicándote que debes <b>acudir a entregarlos en físico</b> a las oficinas del SNTE Sección 26.<br><br>'+
              'Modalidad elegida: <b>'+esc(modalidad||'(no indicada)')+'</b>.<br><br>'+
              'Gracias por tu confianza.<br><br>Atentamente,<br><b>Equipo PASEM · Sección 26 del SNTE</b>'+
            '</td></tr>'+
            '<tr><td style="padding:0 22px 20px;color:#767676;font-size:11px;">PASEM · Sección 26 del SNTE · San Luis Potosí · Administrado por MULTICATERIN, S.A. de C.V. con respaldo de BIDA Seguros.</td></tr>'+
          '</table></td></tr></table></body></html>';
        const from=process.env.REGISTRO_FROM||process.env.MAIL_FROM||'PASEM <asistenciaseccion26@pasem.com>';
        const r=await fetch('https://api.resend.com/emails',{ method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body:JSON.stringify({ from, to:[correo], subject:'PASEM — Recibimos tu registro de afiliación', html, text:'Recibimos tu registro al PASEM. Realizaremos la revisión de tus documentos y posteriormente te notificaremos para entregarlos en físico.' }) });
        correoEnviado=r.ok;
      }catch(e){}
    }
    // Aviso a la administración (opcional)
    try{
      const to=process.env.REGISTRO_TO||'asistenciaseccion26@pasem.com';
      if(key){ const from=process.env.REGISTRO_FROM||process.env.MAIL_FROM||'PASEM <asistenciaseccion26@pasem.com>';
        await fetch('https://api.resend.com/emails',{ method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body:JSON.stringify({ from, to:[to], subject:'PASEM — Nuevo registro de afiliación: '+(nombre||curp), html:'<p>Nuevo registro recibido.</p><p><b>Titular:</b> '+esc(nombre)+'<br><b>CURP:</b> '+esc(curp)+'<br><b>Modalidad:</b> '+esc(modalidad)+'<br><b>Documentos:</b> '+docs.length+'</p><p>Revísalo en el panel → Conciliación de registros.</p>', text:'Nuevo registro: '+nombre+' / '+curp+' / '+modalidad }) });
      }
    }catch(e){}
    return {statusCode:200,headers,body:JSON.stringify({ ok:true, id, correoEnviado })};
  }

  // ---- Acciones de administración (requieren sesión) ----
  const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
  if(!p || !(p.role==='administracion'||p.role==='operacion')) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};

  // Generar (o recuperar) la liga de registro de beneficiarios para un titular aprobado
  if(body.action==='gen-benlink'){
    if(!body.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
    const rec=await store.get('reg:'+body.id,{type:'json'}); if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Registro no encontrado'})};
    // Si ya está aprobado pero sin certificado (registros aprobados antes de los cambios), incorpóralo ahora
    if(!rec.cert && rec.estado==='aprobado'){
      try{
        const f=rec.fields||{};
        const ts=makeStore('pasem-titulares'); const {blobs}=await ts.list();
        const all=(await Promise.all(blobs.map(b=>ts.get(b.key,{type:'json'})))).filter(Boolean);
        const curpU=String(f['CURP']||'').trim().toUpperCase();
        let tit = curpU ? all.find(t=>String(t.curp||'').trim().toUpperCase()===curpU) : null;
        if(!tit){
          let maxN=0; all.forEach(t=>{ const m=/PASEM-(\d+)/.exec(String(t.cert||'')); if(m){ const n=parseInt(m[1],10); if(!isNaN(n)) maxN=Math.max(maxN,n); } });
          const cert='PASEM-'+String(maxN+1).padStart(5,'0'); const tid=crypto.randomUUID();
          tit={ id:tid, cert, nombre:f['Nombre completo']||'', curp:curpU, rfc:f['RFC']||'', telefono:f['Teléfono de contacto']||'', correo:f['Correo electrónico']||'',
                funcion:'', cct:'', ct:'', nivel:'', programa:'telesecundaria', origen:'registro-voluntario',
                modalidadPago:f['Modalidad']||'', personalTelesecundaria:f['Tipo de plaza']||'', formaPago:f['Forma de pago PASEM']||'',
                registroId:rec.id, createdAt:new Date().toISOString(), capturadoPor:p.email||'registro' };
          await ts.setJSON(tid, tit);
        }
        rec.cert=tit.cert; rec.titularId=tit.id; await store.setJSON('reg:'+rec.id, rec);
      }catch(e){}
    }
    if(!rec.cert) return {statusCode:200,headers,body:JSON.stringify({ok:false, reason:'no-aprobado'})};
    let token=rec.benToken;
    if(!token){
      token=crypto.randomBytes(12).toString('hex'); rec.benToken=token; await store.setJSON('reg:'+rec.id, rec);
      try{ const bl=makeStore('pasem-benlinks'); await bl.setJSON('tok:'+token, { token, cert:rec.cert, titularNombre:(rec.fields||{})['Nombre completo']||'', curp:rec.curp||'', registroId:rec.id, createdAt:new Date().toISOString() }); }catch(e){}
    }
    const base=(process.env.SITE_URL||'https://pasem.com').replace(/\/$/,'');
    return {statusCode:200,headers,body:JSON.stringify({ ok:true, token, url:base+'/beneficiarios?t='+token, cert:rec.cert })};
  }

  // Eliminar un registro (solo administración) — para duplicados
  if(body.action==='delete'){
    if(p.role!=='administracion') return {statusCode:401,headers,body:JSON.stringify({error:'Solo administración puede eliminar'})};
    if(!body.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
    try{ await store.delete('reg:'+body.id); }catch(e){}
    return {statusCode:200,headers,body:JSON.stringify({ok:true, deleted:body.id})};
  }

  // Marcar / desmarcar un documento como revisado
  if(body.action==='check-doc'){
    if(!body.id || !body.docId) return {statusCode:400,headers,body:JSON.stringify({error:'Faltan datos'})};
    const rec=await store.get('reg:'+body.id,{type:'json'}); if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Registro no encontrado'})};
    rec.checks=rec.checks||{}; rec.checks[body.docId]=!!body.checked;
    if(rec.estado==='recibido') rec.estado='en-revision';
    await store.setJSON('reg:'+rec.id, rec);
    return {statusCode:200,headers,body:JSON.stringify({ok:true, checks:rec.checks, estado:rec.estado})};
  }

  // Obtener / generar la liga de corrección (para copiar/compartir desde el panel)
  if(body.action==='gen-correclink'){
    if(p.role!=='administracion') return {statusCode:401,headers,body:JSON.stringify({error:'Solo administración'})};
    if(!body.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
    const rec=await store.get('reg:'+body.id,{type:'json'}); if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Registro no encontrado'})};
    if(!rec.correcToken){
      rec.correcToken=crypto.randomBytes(12).toString('hex'); await store.setJSON('reg:'+rec.id, rec);
      try{ const cl=makeStore('pasem-correc'); await cl.setJSON('tok:'+rec.correcToken, { token:rec.correcToken, registroId:rec.id, createdAt:new Date().toISOString() }); }catch(e){}
    }
    const base=(process.env.SITE_URL||'https://pasem.com').replace(/\/$/,'');
    return {statusCode:200,headers,body:JSON.stringify({ ok:true, url:base+'/corregir?t='+rec.correcToken })};
  }

  // Editar datos del titular (completar/corregir registros)
  if(body.action==='edit-fields'){
    if(p.role!=='administracion') return {statusCode:401,headers,body:JSON.stringify({error:'Solo administración'})};
    if(!body.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
    const rec=await store.get('reg:'+body.id,{type:'json'}); if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Registro no encontrado'})};
    const nf=body.fields||{}; rec.fields=rec.fields||{};
    ['Nombre completo','Teléfono de contacto','Correo electrónico','CURP','RFC','Tipo de plaza','Modalidad','Forma de pago PASEM'].forEach(function(k){ if(nf[k]!==undefined) rec.fields[k]=String(nf[k]); });
    if(nf['CURP']!==undefined) rec.curp=String(nf['CURP']||'').trim().toUpperCase();
    rec.editadoAt=new Date().toISOString(); rec.editadoPor=p.email||'usuario';
    await store.setJSON('reg:'+rec.id, rec);
    // Si el registro ya fue aprobado (tiene titular en el padrón), sincronizar ese titular
    let titularSync=false;
    if(rec.titularId || rec.cert){
      try{
        const ts=makeStore('pasem-titulares'); let tit=null, tkey=null;
        if(rec.titularId){ try{ tit=await ts.get(rec.titularId,{type:'json'}); tkey=rec.titularId; }catch(e){} }
        if(!tit && rec.cert){ const {blobs}=await ts.list(); for(const bb of blobs){ const t=await ts.get(bb.key,{type:'json'}); if(t && String(t.cert||'').toUpperCase()===String(rec.cert).toUpperCase()){ tit=t; tkey=bb.key; break; } } }
        if(tit && tkey){
          const f2=rec.fields;
          if(f2['Nombre completo']!==undefined) tit.nombre=f2['Nombre completo'];
          if(f2['CURP']!==undefined) tit.curp=String(f2['CURP']||'').trim().toUpperCase();
          if(f2['RFC']!==undefined) tit.rfc=f2['RFC'];
          if(f2['Teléfono de contacto']!==undefined) tit.telefono=f2['Teléfono de contacto'];
          if(f2['Correo electrónico']!==undefined) tit.correo=f2['Correo electrónico'];
          if(f2['Tipo de plaza']!==undefined) tit.personalTelesecundaria=f2['Tipo de plaza'];
          if(f2['Modalidad']!==undefined) tit.modalidadPago=f2['Modalidad'];
          if(f2['Forma de pago PASEM']!==undefined) tit.formaPago=f2['Forma de pago PASEM'];
          await ts.setJSON(tkey, tit); titularSync=true;
        }
      }catch(e){}
    }
    return {statusCode:200,headers,body:JSON.stringify({ ok:true, fields:rec.fields, titularSync })};
  }

  // Marcar / desmarcar que los formatos se entregaron a FERPTTE (con fecha)
  if(body.action==='set-ferptte'){
    if(p.role!=='administracion') return {statusCode:401,headers,body:JSON.stringify({error:'Solo administración'})};
    if(!body.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
    const rec=await store.get('reg:'+body.id,{type:'json'}); if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Registro no encontrado'})};
    rec.entregadoFerptte=!!body.entregado;
    if(rec.entregadoFerptte){ rec.entregadoFerptteAt=String(body.fecha||'').slice(0,10)||new Date().toISOString().slice(0,10); rec.entregadoFerpttePor=p.email||'usuario'; } else { rec.entregadoFerptteAt=''; rec.entregadoFerpttePor=''; }
    await store.setJSON('reg:'+rec.id, rec);
    return {statusCode:200,headers,body:JSON.stringify({ok:true, entregadoFerptte:rec.entregadoFerptte, at:rec.entregadoFerptteAt})};
  }

  // Marcar / desmarcar entrega de documentos en físico
  if(body.action==='set-fisico'){
    if(p.role!=='administracion') return {statusCode:401,headers,body:JSON.stringify({error:'Solo administración'})};
    if(!body.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
    const rec=await store.get('reg:'+body.id,{type:'json'}); if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Registro no encontrado'})};
    rec.entregadoFisico=!!body.entregado;
    if(rec.entregadoFisico){ rec.entregadoFisicoAt=new Date().toISOString(); rec.entregadoPor=p.email||'usuario'; } else { rec.entregadoFisicoAt=''; rec.entregadoPor=''; }
    await store.setJSON('reg:'+rec.id, rec);
    return {statusCode:200,headers,body:JSON.stringify({ok:true, entregadoFisico:rec.entregadoFisico, at:rec.entregadoFisicoAt})};
  }

  // Devolver el trámite al maestro para corrección (con observaciones + liga de corrección)
  if(body.action==='devolver'){
    if(p.role!=='administracion') return {statusCode:401,headers,body:JSON.stringify({error:'Solo administración'})};
    if(!body.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
    const rec=await store.get('reg:'+body.id,{type:'json'}); if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Registro no encontrado'})};
    const f=rec.fields||{};
    rec.estado='devuelto'; rec.observaciones=String(body.observaciones||''); rec.docsRechazados=Array.isArray(body.docsRechazados)?body.docsRechazados:[];
    rec.devueltoAt=new Date().toISOString(); rec.devueltoPor=p.email||'usuario';
    rec.historial=Array.isArray(rec.historial)?rec.historial:[]; rec.historial.push({ tipo:'devuelto', at:rec.devueltoAt, por:rec.devueltoPor, obs:rec.observaciones });
    if(!rec.correcToken){ rec.correcToken=crypto.randomBytes(12).toString('hex'); try{ const cl=makeStore('pasem-correc'); await cl.setJSON('tok:'+rec.correcToken, { token:rec.correcToken, registroId:rec.id, createdAt:new Date().toISOString() }); }catch(e){} }
    await store.setJSON('reg:'+rec.id, rec);
    const base=(process.env.SITE_URL||'https://pasem.com').replace(/\/$/,'');
    const corregirUrl=base+'/corregir?t='+rec.correcToken;
    const correo=String(f['Correo electrónico']||'').trim(); const nombre=String(f['Nombre completo']||'').trim();
    const key=process.env.RESEND_API_KEY; let correoEnviado=false, reason='';
    // nombres legibles de los documentos rechazados
    const labelOf=(dId)=>{ const d=(rec.docs||[]).find(x=>x.docId===dId); const fn=d?String(d.filename||''):''; const parts=fn.split(' — '); if(parts.length>1 && /\.(pdf|jpe?g|png)$/i.test(parts[parts.length-1].trim())) parts.pop(); return parts.join(' — ')||fn; };
    const listaRech=(rec.docsRechazados||[]).map(labelOf).filter(Boolean);
    if(key && correo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)){
      try{
        const snte=base+'/img/snte26.jpg', bida=base+'/img/bida.png';
        const items=listaRech.length? ('<ul style="margin:8px 0 10px 18px;padding:0;">'+listaRech.map(x=>'<li style="margin:4px 0;">'+esc(x)+'</li>').join('')+'</ul>') : '';
        const html='<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#EAF6F6;font-family:Arial,Helvetica,sans-serif;color:#1f3442;">'+
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF6F6;padding:20px 10px;"><tr><td align="center">'+
          '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #D9E9E9;border-radius:12px;overflow:hidden;">'+
            '<tr><td style="padding:14px 18px;"><table role="presentation" width="100%"><tr><td align="left"><img src="'+snte+'" height="42"></td><td align="right"><img src="'+bida+'" height="42"></td></tr></table></td></tr>'+
            '<tr><td style="background:#DD6B20;padding:16px 18px;text-align:center;color:#fff;font-size:19px;font-weight:800;">Tu registro necesita una corrección</td></tr>'+
            '<tr><td style="height:4px;background:#14B4B6;font-size:0;line-height:0;">&nbsp;</td></tr>'+
            '<tr><td style="padding:20px 22px;font-size:15px;line-height:1.7;color:#1f3442;">'+
              (nombre?('Estimado(a) <b>'+esc(nombre)+'</b>,<br><br>'):'¡Hola!<br><br>')+
              'Revisamos tu registro al PASEM y necesitamos que <b>corrijas o reenvíes</b> lo siguiente:'+
              (items||'<br>')+
              (rec.observaciones?('<div style="background:#FFF7EF;border:1px solid #f1cba6;border-radius:10px;padding:12px 14px;margin:6px 0;"><b>Observaciones:</b><br>'+esc(rec.observaciones)+'</div>'):'')+
              '<br>Entra a tu <b>liga de corrección</b> y vuelve a subir únicamente los documentos indicados. No necesitas volver a llenar todo:<br>'+
              '<div style="margin:10px 0;"><a href="'+corregirUrl+'" style="display:inline-block;background:#DD6B20;color:#fff;text-decoration:none;font-weight:800;border-radius:10px;padding:12px 20px;">Corregir mi registro →</a></div>'+
              '<div style="color:#767676;font-size:13px;">O copia esta liga: '+corregirUrl+'</div><br>'+
              'En cuanto lo recibamos, lo revisaremos de nuevo.<br><br>Atentamente,<br><b>Equipo PASEM · Sección 26 del SNTE</b>'+
            '</td></tr>'+
            '<tr><td style="padding:0 22px 20px;color:#767676;font-size:11px;">PASEM · Sección 26 del SNTE · San Luis Potosí · Administrado por MULTICATERIN, S.A. de C.V. con respaldo de BIDA Seguros.</td></tr>'+
          '</table></td></tr></table></body></html>';
        const from=process.env.REGISTRO_FROM||process.env.MAIL_FROM||'PASEM <asistenciaseccion26@pasem.com>';
        const r=await fetch('https://api.resend.com/emails',{ method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body:JSON.stringify({ from, to:[correo], subject:'PASEM — Tu registro necesita una corrección', html, text:'Tu registro al PASEM necesita corrección: '+(listaRech.join(', ')||'')+'. '+(rec.observaciones||'')+' Corrige en: '+corregirUrl }) });
        const rd=await r.json().catch(()=>({})); correoEnviado=r.ok; if(!r.ok) reason=(rd&&(rd.message||rd.name))||('HTTP '+r.status);
      }catch(e){ reason=String(e&&e.message?e.message:e); }
    } else { reason = !correo?'sin-correo':(!key?'sin-resend':''); }
    return {statusCode:200,headers,body:JSON.stringify({ ok:true, estado:'devuelto', url:corregirUrl, correoEnviado, to:correo, reason })};
  }

  // Aprobar registro: notifica al maestro (entrega física + liga de alta de beneficiarios)
  if(body.action==='aprobar'){
    if(p.role!=='administracion') return {statusCode:401,headers,body:JSON.stringify({error:'Solo administración puede aprobar'})};
    if(!body.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
    const rec=await store.get('reg:'+body.id,{type:'json'}); if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Registro no encontrado'})};
    const f=rec.fields||{};
    const correo=String(f['Correo electrónico']||'').trim();
    const nombre=String(f['Nombre completo']||'').trim();
    rec.estado='aprobado'; rec.aprobadoAt=new Date().toISOString(); rec.aprobadoPor=p.email||'usuario';
    // Incorporar al padrón como titular (origen: registro-voluntario), si no existe por CURP
    try{
      const ts=makeStore('pasem-titulares');
      const {blobs}=await ts.list();
      const all=(await Promise.all(blobs.map(b=>ts.get(b.key,{type:'json'})))).filter(Boolean);
      const curpU=String(f['CURP']||'').trim().toUpperCase();
      let tit = curpU ? all.find(t=>String(t.curp||'').trim().toUpperCase()===curpU) : null;
      if(!tit){
        let maxN=0; all.forEach(t=>{ const m=/PASEM-(\d+)/.exec(String(t.cert||'')); if(m){ const n=parseInt(m[1],10); if(!isNaN(n)) maxN=Math.max(maxN,n); } });
        const cert='PASEM-'+String(maxN+1).padStart(5,'0'); const tid=crypto.randomUUID();
        tit={ id:tid, cert, nombre:f['Nombre completo']||'', curp:curpU, rfc:f['RFC']||'', telefono:f['Teléfono de contacto']||'', correo:f['Correo electrónico']||'',
              funcion:'', cct:'', ct:'', nivel:'', programa:'telesecundaria', origen:'registro-voluntario',
              modalidadPago:f['Modalidad']||'', personalTelesecundaria:f['Tipo de plaza']||'', formaPago:f['Forma de pago PASEM']||'',
              inicioVigencia:rec.inicioVigencia||'', registroId:rec.id, createdAt:new Date().toISOString(), capturadoPor:p.email||'registro' };
        await ts.setJSON(tid, tit);
      }
      rec.cert=tit.cert; rec.titularId=tit.id;
    }catch(e){ rec.titularError=String(e&&e.message?e.message:e); }
    // Generar la liga personalizada de beneficiarios (token) para incluirla en el correo
    const baseUrl=(process.env.SITE_URL||'https://pasem.com').replace(/\/$/,'');
    let benUrl='';
    if(rec.cert){
      if(!rec.benToken){
        rec.benToken=crypto.randomBytes(12).toString('hex');
        try{ const bl=makeStore('pasem-benlinks'); await bl.setJSON('tok:'+rec.benToken, { token:rec.benToken, cert:rec.cert, titularNombre:(rec.fields||{})['Nombre completo']||'', curp:rec.curp||'', registroId:rec.id, createdAt:new Date().toISOString() }); }catch(e){}
      }
      benUrl=baseUrl+'/beneficiarios?t='+rec.benToken;
    }
    await store.setJSON('reg:'+rec.id, rec);
    const key=process.env.RESEND_API_KEY; let correoEnviado=false, reason='';
    if(key && correo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)){
      try{
        const base=baseUrl;
        const snte=base+'/img/snte26.jpg', bida=base+'/img/bida.png'; const altaUrl=benUrl||(base+'/beneficiarios');
        const html='<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#EAF6F6;font-family:Arial,Helvetica,sans-serif;color:#1f3442;">'+
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF6F6;padding:20px 10px;"><tr><td align="center">'+
          '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #D9E9E9;border-radius:12px;overflow:hidden;">'+
            '<tr><td style="padding:14px 18px;"><table role="presentation" width="100%"><tr><td align="left"><img src="'+snte+'" height="42"></td><td align="right"><img src="'+bida+'" height="42"></td></tr></table></td></tr>'+
            '<tr><td style="background:#1e9e52;padding:16px 18px;text-align:center;color:#fff;font-size:19px;font-weight:800;">✓ ¡Tu registro fue exitoso!</td></tr>'+
            '<tr><td style="height:4px;background:#14B4B6;font-size:0;line-height:0;">&nbsp;</td></tr>'+
            '<tr><td style="padding:20px 22px;font-size:15px;line-height:1.7;color:#1f3442;">'+
              (nombre?('Estimado(a) <b>'+esc(nombre)+'</b>,<br><br>'):'¡Hola!<br><br>')+
              'Revisamos tu documentación y tu <b>registro de afiliación al PASEM fue aprobado</b>. ¡Felicidades!<br><br>'+
              '<b>1) Entrega tus documentos en físico</b><br>'+
              'Debes acudir a entregar tus documentos firmados en las oficinas de <b>BIDA Seguros</b>, dentro del SNTE Sección 26:<br>'+
              '<div style="background:#F4FAFA;border:1px solid #D9E9E9;border-radius:10px;padding:12px 14px;margin:8px 0;">'+
                '📍 <b>Av. Himno Nacional No. 1800, Col. Burócrata, C.P. 78270, San Luis Potosí.</b><br>'+
                '🕘 <b>Horario:</b> Lunes a viernes de 9:00 a 15:00 h y de 19:00 a 21:00 h.'+
              '</div>'+
              '<b>2) Registra a tus beneficiarios</b><br>'+
              'Ya puedes registrar a tus beneficiarios en tu <b>liga personalizada</b>. <b>En este paso ya no necesitas anexar la documentación de afiliación</b>, solo la de tus beneficiarios. Puedes volver a entrar cuando quieras para agregar o quitar beneficiarios:<br>'+
              '<div style="margin:10px 0;"><a href="'+altaUrl+'" style="display:inline-block;background:#DD6B20;color:#fff;text-decoration:none;font-weight:800;border-radius:10px;padding:12px 20px;">Registrar mis beneficiarios →</a></div>'+
              '<div style="color:#767676;font-size:13px;">O copia esta liga: '+altaUrl+'</div><br>'+
              'Atentamente,<br><b>Equipo PASEM · Sección 26 del SNTE</b>'+
            '</td></tr>'+
            '<tr><td style="padding:0 22px 20px;color:#767676;font-size:11px;">PASEM · Sección 26 del SNTE · San Luis Potosí · Administrado por MULTICATERIN, S.A. de C.V. con respaldo de BIDA Seguros.</td></tr>'+
          '</table></td></tr></table></body></html>';
        const from=process.env.REGISTRO_FROM||process.env.MAIL_FROM||'PASEM <asistenciaseccion26@pasem.com>';
        const r=await fetch('https://api.resend.com/emails',{ method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body:JSON.stringify({ from, to:[correo], subject:'PASEM — Tu registro fue aprobado · siguientes pasos', html, text:'Tu registro al PASEM fue aprobado. Entrega tus documentos en físico en BIDA Seguros (Av. Himno Nacional 1800, Col. Burócrata, SLP), L-V 9-15h y 19-21h. Da de alta a tus beneficiarios en: '+altaUrl }) });
        const rd=await r.json().catch(()=>({})); correoEnviado=r.ok; if(!r.ok) reason=(rd&&(rd.message||rd.name))||('HTTP '+r.status);
      }catch(e){ reason=String(e&&e.message?e.message:e); }
    } else { reason = !correo?'sin-correo':(!key?'sin-resend':''); }
    return {statusCode:200,headers,body:JSON.stringify({ok:true, estado:'aprobado', correoEnviado, to:correo, reason})};
  }

  return {statusCode:400,headers,body:JSON.stringify({error:'Acción no válida'})};
};
