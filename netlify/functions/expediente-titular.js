import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }
const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function sign(payload){ const h=b64url(JSON.stringify({alg:'HS256',typ:'JWT'})); const p=b64url(JSON.stringify(payload)); const data=h+'.'+p; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); return data+'.'+sig; }
function verify(token){ if(!token) return null; const parts=token.split('.'); if(parts.length!==3) return null; const data=parts[0]+'.'+parts[1]; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); if(sig!==parts[2]) return null; let o; try{ o=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; } if(o.exp && Math.floor(Date.now()/1000)>o.exp) return null; return o; }
function hashPw(password,salt){ salt=salt||crypto.randomBytes(16).toString('hex'); const hash=crypto.scryptSync(String(password),salt,64).toString('hex'); return {salt,hash}; }
function checkPw(password,salt,hash){ try{ const h=crypto.scryptSync(String(password),salt,64).toString('hex'); const a=Buffer.from(h),b=Buffer.from(hash); return a.length===b.length && crypto.timingSafeEqual(a,b); }catch(e){ return false; } }
const esc=s=>String(s==null?'':s);

export const handler = async (event) => {
  const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*'};
  if(event.httpMethod!=='POST') return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  let body={}; try{ body=JSON.parse(event.body||'{}'); }catch(e){ return {statusCode:400,headers,body:JSON.stringify({error:'JSON inválido'})}; }
  const creds=makeStore('pasem-expcreds');

  // --- Admin: asignar / restablecer contraseña de expediente (usuario = CURP) ---
  if(body.action==='set-password'){
    const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
    if(!p || p.role!=='administracion') return {statusCode:401,headers,body:JSON.stringify({error:'Solo administración'})};
    const curp=String(body.curp||'').trim().toUpperCase();
    const pw=String(body.password||'');
    if(!curp || pw.length<4) return {statusCode:400,headers,body:JSON.stringify({error:'CURP y contraseña (mín. 4 caracteres) requeridos.'})};
    const {salt,hash}=hashPw(pw);
    await creds.setJSON('cred:'+curp, { curp, salt, hash, nombre:String(body.nombre||''), cert:String(body.cert||''), updatedAt:new Date().toISOString(), updatedBy:p.email||'admin' });
    return {statusCode:200,headers,body:JSON.stringify({ ok:true, curp })};
  }

  // --- Titular: login con CURP + contraseña ---
  if(body.action==='login'){
    const curp=String(body.curp||'').trim().toUpperCase();
    const c=await creds.get('cred:'+curp,{type:'json'});
    if(!c || !checkPw(body.password||'', c.salt, c.hash)) return {statusCode:401,headers,body:JSON.stringify({error:'CURP o contraseña incorrectos.'})};
    const token=sign({ curp, role:'titular', exp:Math.floor(Date.now()/1000)+60*60*4 });
    return {statusCode:200,headers,body:JSON.stringify({ ok:true, token, nombre:c.nombre||'', cert:c.cert||'' })};
  }

  // --- Titular: ver su expediente ---
  if(body.action==='expediente'){
    const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
    if(!p || p.role!=='titular') return {statusCode:401,headers,body:JSON.stringify({error:'Sesión no válida'})};
    const curp=String(p.curp||'').toUpperCase();
    let nombre='', cert='', docsTitular=[], benef=[];
    // Registro del titular (documentos de afiliación)
    try{
      const rs=makeStore('pasem-registros'); const {blobs}=await rs.list();
      const regs=(await Promise.all(blobs.filter(b=>b.key.indexOf('reg:')===0).map(b=>rs.get(b.key,{type:'json'})))).filter(Boolean);
      const rec=regs.find(r=>String((r.fields||{})['CURP']||'').trim().toUpperCase()===curp);
      if(rec){ nombre=(rec.fields||{})['Nombre completo']||''; cert=rec.cert||''; docsTitular=(rec.docs||[]).map(d=>({docId:d.docId, filename:d.filename, store:'pasem-reg-docs'})); }
    }catch(e){}
    // Titular en padrón (para cert/nombre si no vino del registro)
    if(!cert){ try{ const ts=makeStore('pasem-titulares'); const {blobs}=await ts.list(); const all=(await Promise.all(blobs.map(b=>ts.get(b.key,{type:'json'})))).filter(Boolean); const t=all.find(x=>String(x.curp||'').toUpperCase()===curp); if(t){ nombre=nombre||t.nombre||''; cert=t.cert||''; } }catch(e){} }
    // Beneficiarios (dependientes) y sus documentos
    if(cert){ try{
      const ds=makeStore('pasem-dependientes'); const {blobs}=await ds.list();
      const all=(await Promise.all(blobs.map(b=>ds.get(b.key,{type:'json'})))).filter(Boolean);
      benef=all.filter(d=>String(d.titularCert||'').toUpperCase()===String(cert).toUpperCase())
               .map(d=>({ nombre:d.nombre, parentesco:d.parentesco, curp:d.curp, docs:(d.docs||[]).map(x=>({docId:x.docId, filename:x.filename, store:'pasem-reg-docs'})) }));
    }catch(e){} }
    return {statusCode:200,headers,body:JSON.stringify({ ok:true, nombre, cert, curp, docsTitular, beneficiarios:benef })};
  }

  return {statusCode:400,headers,body:JSON.stringify({error:'Acción no válida'})};
};
