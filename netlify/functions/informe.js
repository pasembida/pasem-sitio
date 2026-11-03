import crypto from 'node:crypto';
import { computeInforme, informeEmailHtml, dayOf, fmtFecha } from './lib/informe-core.js';
const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function verify(token){ if(!token) return null; const parts=token.split('.'); if(parts.length!==3) return null; const data=parts[0]+'.'+parts[1]; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); if(sig!==parts[2]) return null; let p; try{ p=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; } if(p.exp&&Math.floor(Date.now()/1000)>p.exp) return null; return p; }

export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
  if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
  if(p.role!=='administracion') return {statusCode:403,headers,body:JSON.stringify({error:'Solo administración puede generar este informe'})};

  if(event.httpMethod==='POST'){
    const key=process.env.RESEND_API_KEY;
    if(!key) return {statusCode:500,headers,body:JSON.stringify({error:'Falta configurar RESEND_API_KEY en Netlify.'})};
    try{
      const data=await computeInforme();
      const from=process.env.INFORME_FROM||process.env.MAIL_FROM||'PASEM <asistenciaseccion26@pasem.com>';
      const to=process.env.INFORME_TO||'bidaseguros@bidaseguros.org';
      const t=data.totals||{};
      const payload={ from, to:[to],
        subject:'PASEM — Informe a la Dirección General ('+dayOf(data.generatedAt)+')',
        html: informeEmailHtml(data),
        text:'Informe a la Dirección General — PASEM\nGenerado: '+fmtFecha(data.generatedAt)+'\nPadrón de titulares: '+data.padronTotal+'\nProcedimientos abiertos: '+(data.procedimientos||[]).length };
      const r=await fetch('https://api.resend.com/emails',{ method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
      const rd=await r.json().catch(()=>({}));
      if(!r.ok) return {statusCode:502,headers,body:JSON.stringify({error:(rd&&(rd.message||rd.name))||('Error de Resend '+r.status)})};
      return {statusCode:200,headers,body:JSON.stringify({ok:true, to, emailId:rd.id})};
    }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
  }

  // GET: devolver el informe calculado
  try{ const data=await computeInforme(); return {statusCode:200,headers,body:JSON.stringify(data)}; }
  catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
