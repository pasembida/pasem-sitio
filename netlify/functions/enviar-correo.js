import crypto from 'node:crypto';
const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function verify(token){ if(!token) return null; const parts=token.split('.'); if(parts.length!==3) return null; const data=parts[0]+'.'+parts[1]; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); if(sig!==parts[2]) return null; let p; try{ p=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; } if(p.exp&&Math.floor(Date.now()/1000)>p.exp) return null; return p; }

export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
  if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
  if(!(p.role==='administracion'||p.role==='operacion')) return {statusCode:403,headers,body:JSON.stringify({error:'Sin rol asignado'})};
  if(event.httpMethod!=='POST') return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};

  const key=process.env.RESEND_API_KEY;
  if(!key) return {statusCode:500,headers,body:JSON.stringify({error:'Falta configurar RESEND_API_KEY en Netlify.'})};

  try{
    const body=JSON.parse(event.body||'{}');
    const to=body.to; if(!to) return {statusCode:400,headers,body:JSON.stringify({error:'Falta el destinatario'})};
    const from=process.env.MAIL_FROM||'PASEM <asistenciaseccion26@pasem.com>';
    const cc=body.cc || process.env.MAIL_CC || 'bidaseguros@bidaseguros.org';
    const payload={
      from,
      to: Array.isArray(to)?to:[to],
      cc: cc ? (Array.isArray(cc)?cc:[cc]) : undefined,
      subject: body.subject || '(sin asunto)',
      text: body.text || ''
    };
    const r=await fetch('https://api.resend.com/emails',{ method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) return {statusCode:502,headers,body:JSON.stringify({error:(data&&(data.message||data.name))||('Error de Resend '+r.status)})};
    return {statusCode:200,headers,body:JSON.stringify({ok:true, id:data.id})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
