import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
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
