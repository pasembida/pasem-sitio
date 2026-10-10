import crypto from 'node:crypto';
const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function verify(token){ if(!token) return null; const parts=token.split('.'); if(parts.length!==3) return null; const data=parts[0]+'.'+parts[1]; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); if(sig!==parts[2]) return null; let p; try{ p=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; } if(p.exp&&Math.floor(Date.now()/1000)>p.exp) return null; return p; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

// Convierte el texto (líneas "Etiqueta: valor") en una tabla con filas alternas.
function bodyToRows(text){
  const lines=String(text||'').split(/\r?\n/);
  let rows=''; let alt=0;
  for(const raw of lines){
    const line=raw.trim();
    if(!line){ continue; }
    const idx=line.indexOf(':');
    if(idx>0 && idx<=38){
      const k=line.slice(0,idx).trim(); const v=line.slice(idx+1).trim();
      const bg = alt%2===0 ? '#ffffff' : '#F7FCFC';
      rows+='<tr>'
        +'<td style="padding:9px 14px;border-bottom:1px solid #E9EEF0;background:#FFF3EA;color:#333333;font-weight:700;font-size:13px;width:42%;vertical-align:top;">'+esc(k)+'</td>'
        +'<td style="padding:9px 14px;border-bottom:1px solid #E9EEF0;background:'+bg+';color:#333333;font-size:13px;vertical-align:top;">'+(v?esc(v):'&nbsp;')+'</td>'
        +'</tr>';
      alt++;
    } else {
      rows+='<tr><td colspan="2" style="padding:10px 14px;background:#E6F6F6;color:#0E9A9C;font-weight:700;font-size:13px;border-bottom:1px solid #E9EEF0;">'+esc(line)+'</td></tr>';
    }
  }
  return rows;
}

function buildHtml(subject, text){
  const base=(process.env.SITE_URL||'https://pasem.com').replace(/\/$/,'');
  const snte=base+'/img/snte26.jpg';
  const bida=base+'/img/bida.png';
  const rows=bodyToRows(text);
  return ''+
  '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
  '<body style="margin:0;padding:0;background:#EAF6F6;">'+
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF6F6;padding:18px 10px;"><tr><td align="center">'+
  '<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #D9E9E9;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">'+
    // logos
    '<tr><td style="padding:14px 18px;background:#ffffff;">'+
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'+
        '<td align="left" style="vertical-align:middle;"><img src="'+snte+'" alt="SNTE 26" height="46" style="height:46px;display:block;"></td>'+
        '<td align="right" style="vertical-align:middle;"><img src="'+bida+'" alt="BIDA Seguros" height="46" style="height:46px;display:block;"></td>'+
      '</tr></table>'+
    '</td></tr>'+
    // barra naranja
    '<tr><td style="background:#DD6B20;padding:14px 18px;text-align:center;">'+
      '<div style="color:#ffffff;font-size:12px;letter-spacing:.5px;">Programa de Apoyo de Servicios Médicos</div>'+
      '<div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:1px;">PASEM</div>'+
      '<div style="color:#ffffff;font-size:11px;opacity:.9;">Sección 26 del SNTE · San Luis Potosí</div>'+
    '</td></tr>'+
    // acento turquesa
    '<tr><td style="height:4px;background:#14B4B6;font-size:0;line-height:0;">&nbsp;</td></tr>'+
    // titulo (asunto)
    '<tr><td style="padding:16px 18px 6px;"><div style="color:#333333;font-size:16px;font-weight:700;">'+esc(subject||'Notificación PASEM')+'</div></td></tr>'+
    // tabla de datos
    '<tr><td style="padding:6px 18px 4px;">'+
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E9EEF0;border-radius:8px;overflow:hidden;">'+rows+'</table>'+
    '</td></tr>'+
    // pie
    '<tr><td style="padding:14px 18px 18px;">'+
      '<div style="color:#767676;font-size:11px;line-height:1.5;">Este mensaje es una notificación del Programa de Apoyo de Servicios Médicos (PASEM) de la Sección 26 del SNTE, administrado por MULTICATERIN, S.A. de C.V. con respaldo de BIDA Seguros. Si lo recibiste por error, ignóralo.</div>'+
    '</td></tr>'+
  '</table>'+
  '</td></tr></table></body></html>';
}

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
    const subject=body.subject || 'Notificación PASEM';
    const text=body.text || '';
    const payload={
      from,
      to: Array.isArray(to)?to:[to],
      cc: cc ? (Array.isArray(cc)?cc:[cc]) : undefined,
      subject,
      text,                       // respaldo en texto plano
      html: buildHtml(subject, text)
    };
    const r=await fetch('https://api.resend.com/emails',{ method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) return {statusCode:502,headers,body:JSON.stringify({error:(data&&(data.message||data.name))||('Error de Resend '+r.status)})};
    return {statusCode:200,headers,body:JSON.stringify({ok:true, id:data.id})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
