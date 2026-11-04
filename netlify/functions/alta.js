import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import BASE_RAW from './lib/beneficiarios.json';
const PADRON_CURPS=(function(){ const s=new Set(); (Array.isArray(BASE_RAW)?BASE_RAW:[]).forEach(x=>{ const c=String((x&&(x.c||x.curp))||'').trim().toUpperCase(); if(c) s.add(c); }); return s; })();
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }
const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function verify(token){ if(!token) return null; const parts=token.split('.'); if(parts.length!==3) return null; const data=parts[0]+'.'+parts[1]; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); if(sig!==parts[2]) return null; let p; try{ p=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; } if(p.exp&&Math.floor(Date.now()/1000)>p.exp) return null; return p; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function rowsFromEntries(entries){
  let r='',alt=0;
  for(const [k,v] of entries){
    if(v==null||String(v).trim()==='') continue;
    const bg = alt%2===0 ? '#ffffff' : '#F7FCFC';
    r+='<tr><td style="padding:8px 12px;border-bottom:1px solid #E9EEF0;background:#FFF3EA;color:#333;font-weight:700;font-size:13px;width:46%;vertical-align:top;">'+esc(k)+'</td>'
      +'<td style="padding:8px 12px;border-bottom:1px solid #E9EEF0;background:'+bg+';color:#333;font-size:13px;vertical-align:top;">'+esc(v)+'</td></tr>';
    alt++;
  }
  return r;
}

function buildHtml(fields, docNames){
  const base=(process.env.SITE_URL||'https://pasem.com').replace(/\/$/,'');
  const snte=base+'/img/snte26.jpg', bida=base+'/img/bida.png';
  const entries=Object.entries(fields||{});
  const contacto=entries.filter(([k])=>k.startsWith('Contacto - '));
  const resto=entries.filter(([k])=>!k.startsWith('Contacto - '));
  const titular=[fields['Titular - Primer apellido'],fields['Titular - Segundo apellido'],fields['Titular - Nombres']].filter(Boolean).join(' ');
  const contactoRows=rowsFromEntries(contacto.map(([k,v])=>[k.replace('Contacto - ',''),v]));
  const restoRows=rowsFromEntries(resto);
  const docsBlock = (docNames&&docNames.length)
    ? '<tr><td colspan="2" style="padding:10px 12px;background:#E6F6F6;color:#0E9A9C;font-weight:700;font-size:13px;border-bottom:1px solid #E9EEF0;">Documentos adjuntos ('+docNames.length+')</td></tr>'
      + docNames.map((n,i)=>'<tr><td style="padding:8px 12px;border-bottom:1px solid #E9EEF0;background:#FFF3EA;color:#333;font-weight:700;font-size:13px;width:46%;">Documento '+(i+1)+'</td><td style="padding:8px 12px;border-bottom:1px solid #E9EEF0;color:#333;font-size:13px;">'+esc(n)+'</td></tr>').join('')
    : '<tr><td colspan="2" style="padding:10px 12px;background:#FDECEC;color:#9a3b3b;font-size:13px;">Sin documentos adjuntos.</td></tr>';
  return ''+
  '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#EAF6F6;">'+
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF6F6;padding:18px 10px;"><tr><td align="center">'+
  '<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border:1px solid #D9E9E9;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">'+
    '<tr><td style="padding:14px 18px;background:#fff;"><table role="presentation" width="100%"><tr>'+
      '<td align="left"><img src="'+snte+'" alt="SNTE 26" height="46" style="height:46px;display:block;"></td>'+
      '<td align="right"><img src="'+bida+'" alt="BIDA" height="46" style="height:46px;display:block;"></td>'+
    '</tr></table></td></tr>'+
    '<tr><td style="background:#DD6B20;padding:14px 18px;text-align:center;">'+
      '<div style="color:#fff;font-size:12px;">Programa de Apoyo de Servicios Médicos</div>'+
      '<div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:1px;">PASEM</div>'+
      '<div style="color:#fff;font-size:11px;opacity:.9;">Nueva alta de beneficiario</div>'+
    '</td></tr>'+
    '<tr><td style="height:4px;background:#14B4B6;font-size:0;line-height:0;">&nbsp;</td></tr>'+
    '<tr><td style="padding:16px 18px 4px;"><div style="color:#333;font-size:16px;font-weight:700;">Datos de contacto (a quién responder)</div></td></tr>'+
    '<tr><td style="padding:4px 18px;"><table role="presentation" width="100%" style="border:1px solid #E9EEF0;border-radius:8px;overflow:hidden;">'+
      (contactoRows||'<tr><td style="padding:10px 12px;color:#9a3b3b;font-size:13px;">No se capturaron datos de contacto.</td></tr>')+'</table></td></tr>'+
    '<tr><td style="padding:14px 18px 4px;"><div style="color:#333;font-size:16px;font-weight:700;">Datos del formato de alta'+(titular?(' — '+esc(titular)):'')+'</div></td></tr>'+
    '<tr><td style="padding:4px 18px 4px;"><table role="presentation" width="100%" style="border:1px solid #E9EEF0;border-radius:8px;overflow:hidden;">'+restoRows+'</table></td></tr>'+
    '<tr><td style="padding:10px 18px 4px;"><table role="presentation" width="100%" style="border:1px solid #E9EEF0;border-radius:8px;overflow:hidden;">'+docsBlock+'</table></td></tr>'+
    '<tr><td style="padding:14px 18px 18px;"><div style="color:#767676;font-size:11px;line-height:1.5;">Registro recibido desde el formulario público de alta de beneficiarios (pasem.com/alta).</div></td></tr>'+
  '</table></td></tr></table></body></html>';
}

export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};

  // ---- Consulta del panel (requiere sesión) ----
  if(event.httpMethod==='GET'){
    const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
    if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
    if(!(p.role==='administracion'||p.role==='operacion')) return {statusCode:403,headers,body:JSON.stringify({error:'Sin rol asignado'})};
    const qp=event.queryStringParameters||{};
    try{
      if(qp.doc){
        const ds=makeStore('pasem-altas-docs');
        const meta=await ds.get('meta:'+qp.doc,{type:'json'});
        if(!meta) return {statusCode:404,headers,body:JSON.stringify({error:'Documento no encontrado'})};
        let b64=''; for(let i=0;i<(meta.chunks||1);i++){ const c=await ds.get('chunk:'+qp.doc+':'+i,{type:'text'}); if(c) b64+=c; }
        return {statusCode:200,headers,body:JSON.stringify({filename:meta.filename,type:meta.type,data:b64})};
      }
      const rs=makeStore('pasem-altas');
      const { blobs }=await rs.list({ prefix:'alta:' });
      let items=await Promise.all(blobs.map(b=>rs.get(b.key,{type:'json'})));
      items=items.filter(Boolean).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      // CURPs ya dadas de alta como titulares (para no marcarlas como "NUEVO" otra vez)
      const curpsAlta=new Set();
      try{ const ts=makeStore('pasem-titulares'); const tb=await ts.list(); const tits=(await Promise.all(tb.blobs.map(b=>ts.get(b.key,{type:'json'})))).filter(Boolean); tits.forEach(t=>{ const c=String(t.curp||'').trim().toUpperCase(); if(c) curpsAlta.add(c); }); }catch(e){}
      items.forEach(it=>{ const f=it.fields||{}; const c=String(f['Titular - CURP']||f['Contacto - CURP']||'').trim().toUpperCase(); it.titularCurp=c; it.enPadron = c ? (PADRON_CURPS.has(c)||curpsAlta.has(c)) : null; });
      return {statusCode:200,headers,body:JSON.stringify(items)};
    }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
  }

  // ---- Eliminar un alta y sus documentos (solo administración) ----
  if(event.httpMethod==='DELETE' || (event.httpMethod==='POST' && (()=>{try{return JSON.parse(event.body||'{}').action==='delete';}catch(e){return false;}})())){
    const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
    if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
    if(p.role!=='administracion') return {statusCode:403,headers,body:JSON.stringify({error:'Solo administración puede eliminar'})};
    let id;
    try{ id=(JSON.parse(event.body||'{}').id)||(event.queryStringParameters||{}).id; }catch(e){ id=(event.queryStringParameters||{}).id; }
    if(!id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta el id'})};
    try{
      const rs=makeStore('pasem-altas');
      const rec=await rs.get('alta:'+id,{type:'json'});
      const ds=makeStore('pasem-altas-docs');
      if(rec && Array.isArray(rec.docs)){
        for(const d of rec.docs){
          try{
            const meta=await ds.get('meta:'+d.docId,{type:'json'});
            const n=(meta&&meta.chunks)||1;
            for(let i=0;i<n;i++){ await ds.delete('chunk:'+d.docId+':'+i); }
            await ds.delete('meta:'+d.docId);
          }catch(e){}
        }
      }
      await rs.delete('alta:'+id);
      return {statusCode:200,headers,body:JSON.stringify({ok:true})};
    }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
  }

  // Copiar documentos de un alta al EXPEDIENTE (por CURP). Autenticado (admin/operación). Idempotente por CURP.
  if(event.httpMethod==='POST' && (()=>{try{return JSON.parse(event.body||'{}').action==='to-expediente';}catch(e){return false;}})()){
    const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
    if(!p || !(p.role==='administracion'||p.role==='operacion')) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
    try{
      const body=JSON.parse(event.body||'{}');
      const curp=String(body.curp||'').trim().toUpperCase();
      if(!body.id || !curp) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id o CURP'})};
      const rs=makeStore('pasem-altas'); const rec=await rs.get('alta:'+body.id,{type:'json'});
      if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Alta no encontrada'})};
      rec.copiados=rec.copiados||{};
      if(rec.copiados[curp]) return {statusCode:200,headers,body:JSON.stringify({ok:true, copiados:0, yaCopiado:true})};
      const ds=makeStore('pasem-altas-docs'); const ex=makeStore('pasem-expedientes');
      let copiados=0;
      for(const d of (Array.isArray(rec.docs)?rec.docs:[])){
        try{
          const meta=await ds.get('meta:'+d.docId,{type:'json'}); if(!meta) continue;
          const n=meta.chunks||1; const nid=crypto.randomUUID();
          for(let i=0;i<n;i++){ const c=await ds.get('chunk:'+d.docId+':'+i,{type:'text'}); if(c!=null) await ex.set('chunk:'+nid+':'+i, String(c)); }
          await ex.setJSON('meta:'+nid, { id:nid, filename:meta.filename||'documento', mime:meta.type||'application/octet-stream', ref:curp, desc:'Documento del alta en línea', chunks:n, uploadedBy:(p.email||'sistema'), createdAt:new Date().toISOString() });
          copiados++;
        }catch(e){}
      }
      rec.copiados[curp]=new Date().toISOString();
      await rs.setJSON('alta:'+rec.id, rec);
      return {statusCode:200,headers,body:JSON.stringify({ok:true, copiados})};
    }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
  }

  // Registrar los DEPENDIENTES de un alta bajo el titular (aunque el titular ya exista en el padrón)
  if(event.httpMethod==='POST' && (()=>{try{return JSON.parse(event.body||'{}').action==='register-deps';}catch(e){return false;}})()){
    const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
    if(!p || !(p.role==='administracion'||p.role==='operacion')) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
    try{
      const body=JSON.parse(event.body||'{}');
      if(!body.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id del alta'})};
      const rs=makeStore('pasem-altas'); const rec=await rs.get('alta:'+body.id,{type:'json'});
      if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Alta no encontrada'})};
      const f=rec.fields||{};
      const titCurp=String(f['Titular - CURP']||f['Contacto - CURP']||'').trim().toUpperCase();
      if(!titCurp) return {statusCode:400,headers,body:JSON.stringify({error:'El alta no tiene CURP del titular'})};
      const nom=(a,b,c)=>[a,b,c].filter(Boolean).join(' ').trim();
      const titNombre = nom(f['Titular - Primer apellido'],f['Titular - Segundo apellido'],f['Titular - Nombres']) || f['Contacto - Nombre'] || '';
      // Resolver certificado del titular: 1) titulares dados de alta, 2) padrón base
      let cert='';
      try{ const ts=makeStore('pasem-titulares'); const {blobs:tb}=await ts.list(); const tits=(await Promise.all(tb.map(b=>ts.get(b.key,{type:'json'})))).filter(Boolean); const t=tits.find(x=>String(x.curp||'').trim().toUpperCase()===titCurp); if(t) cert=t.cert; }catch(e){}
      if(!cert){ const be=(Array.isArray(BASE_RAW)?BASE_RAW:[]).find(x=>String(x.c||x.curp||'').trim().toUpperCase()===titCurp); if(be) cert=be.ce||be.cert||''; }
      if(!cert) return {statusCode:404,headers,body:JSON.stringify({error:'El titular no está en el padrón ni dado de alta. Primero da de alta al titular.'})};
      // Construir dependientes del alta
      const deps=[];
      const cony=nom(f['Cónyuge - Nombres'],f['Cónyuge - Primer apellido'],f['Cónyuge - Segundo apellido']);
      if(cony||f['Cónyuge - CURP']) deps.push({nombre:cony||'(Cónyuge)',parentesco:'Cónyuge',curp:f['Cónyuge - CURP']||'',fechaNacimiento:f['Cónyuge - Fecha nacimiento']||'',sexo:f['Cónyuge - Sexo']||''});
      for(let i=1;i<=4;i++){ const hn=f['Hijo '+i+' - Nombre']; if(hn&&String(hn).trim()) deps.push({nombre:hn,parentesco:'Hijo(a)',curp:f['Hijo '+i+' - CURP']||'',fechaNacimiento:f['Hijo '+i+' - Fecha nacimiento']||'',estudia:f['Hijo '+i+' - Estudia']||''}); }
      for(let j=1;j<=2;j++){ const pn=f['Padre '+j+' - Nombre']; if(pn&&String(pn).trim()) deps.push({nombre:pn,parentesco:f['Padre '+j+' - Parentesco']||'Padre/Madre',curp:f['Padre '+j+' - CURP']||'',fechaNacimiento:f['Padre '+j+' - Fecha nacimiento']||''}); }
      // Guardar dependientes (dedupe por CURP, con letra correlativa)
      const ds=makeStore('pasem-dependientes'); const {blobs:db}=await ds.list();
      const all=(await Promise.all(db.map(b=>ds.get(b.key,{type:'json'})))).filter(Boolean);
      const certU=cert.toUpperCase();
      const usadas=all.filter(d=>String(d.titularCert||'').toUpperCase()===certU).map(d=>String(d.cert||'').slice(cert.length));
      let creados=0; const yaExiste=[];
      for(const dp of deps){
        const cu=String(dp.curp||'').trim().toUpperCase();
        if(cu && all.find(d=>String(d.titularCert||'').toUpperCase()===certU && String(d.curp||'').trim().toUpperCase()===cu)){ yaExiste.push(dp.nombre); continue; }
        let letter='A'; for(let k=0;k<26;k++){ const L=String.fromCharCode(65+k); if(usadas.indexOf(L)<0){ letter=L; break; } }
        usadas.push(letter);
        const id=crypto.randomUUID();
        await ds.setJSON(id, { id, cert:cert+letter, titularCert:cert, titularNombre:titNombre, nombre:dp.nombre, parentesco:dp.parentesco, curp:dp.curp||'', fechaNacimiento:dp.fechaNacimiento||'', sexo:dp.sexo||'', estudia:dp.estudia||'', origen:'alta-en-linea', altaId:rec.id, createdAt:new Date().toISOString(), capturadoPor:p.email||'usuario' });
        creados++;
      }
      // Copiar documentos del alta al expediente del titular (idempotente)
      let docsCopiados=0;
      try{
        rec.copiados=rec.copiados||{};
        if(!rec.copiados[titCurp] && Array.isArray(rec.docs) && rec.docs.length){
          const dds=makeStore('pasem-altas-docs'); const ex=makeStore('pasem-expedientes');
          for(const d of rec.docs){ const meta=await dds.get('meta:'+d.docId,{type:'json'}); if(!meta) continue; const n=meta.chunks||1; const nid=crypto.randomUUID(); for(let i=0;i<n;i++){ const c=await dds.get('chunk:'+d.docId+':'+i,{type:'text'}); if(c!=null) await ex.set('chunk:'+nid+':'+i,String(c)); } await ex.setJSON('meta:'+nid,{id:nid,filename:meta.filename||'documento',mime:meta.type||'application/octet-stream',ref:titCurp,desc:'Documento del alta en línea',chunks:n,uploadedBy:(p.email||'sistema'),createdAt:new Date().toISOString()}); docsCopiados++; }
          rec.copiados[titCurp]=new Date().toISOString(); await rs.setJSON('alta:'+rec.id, rec);
        }
      }catch(e){}
      return {statusCode:200,headers,body:JSON.stringify({ok:true, cert, creados, yaExiste, docsCopiados})};
    }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
  }

  if(event.httpMethod!=='POST') return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  const key=process.env.RESEND_API_KEY;
  try{
    // El alta pública NO lleva action; si llegara 'delete' ya se habría manejado arriba.
    const body=JSON.parse(event.body||'{}');
    const fields=body.fields||{};
    if(fields['bot-field']) return {statusCode:200,headers,body:JSON.stringify({ok:true})}; // honeypot
    const docs=Array.isArray(body.docs)?body.docs:[];

    // Guardar respaldo del alta en Blobs
    const altaId=crypto.randomUUID();
    const recStore=makeStore('pasem-altas');
    await recStore.setJSON('alta:'+altaId, { id:altaId, createdAt:new Date().toISOString(), fields, docs });

    // Reensamblar documentos desde Blobs para adjuntarlos al correo
    const docStore=makeStore('pasem-altas-docs');
    const attachments=[]; const docNames=[]; let totalB64=0;
    for(const d of docs){
      try{
        const meta=await docStore.get('meta:'+d.docId,{type:'json'});
        if(!meta) continue;
        let b64='';
        for(let i=0;i<(meta.chunks||1);i++){ const c=await docStore.get('chunk:'+d.docId+':'+i,{type:'text'}); if(c) b64+=c; }
        if(!b64) continue;
        docNames.push(meta.filename||'documento');
        totalB64+=b64.length;
        if(totalB64 <= 26_000_000){ attachments.push({ filename: meta.filename||('documento-'+(docNames.length)), content: b64 }); }
      }catch(e){ /* omitir doc con error */ }
    }

    if(!key){ return {statusCode:200,headers,body:JSON.stringify({ok:true, id:altaId, warning:'Guardado, pero falta RESEND_API_KEY para enviar correo.'})}; }

    const from=process.env.MAIL_FROM||'PASEM <asistenciaseccion26@pasem.com>';
    const to=process.env.ALTA_TO||'rodrigoperez@bidaseguros.org';
    const cc=process.env.ALTA_CC||'asistenciaseccion26@pasem.com';
    const nombreContacto=fields['Contacto - Nombre']||'';
    const payload={
      from,
      to:[to],
      subject:'PASEM — Nueva alta de beneficiario'+(nombreContacto?(': '+nombreContacto):''),
      html: buildHtml(fields, docNames),
      attachments: attachments.length?attachments:undefined
    };
    if(cc) payload.cc=[cc];

    const r=await fetch('https://api.resend.com/emails',{ method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) return {statusCode:200,headers,body:JSON.stringify({ok:true, id:altaId, warning:'Guardado, pero el correo no se envió: '+((data&&(data.message||data.name))||('Resend '+r.status))})};
    return {statusCode:200,headers,body:JSON.stringify({ok:true, id:altaId, emailId:data.id})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
