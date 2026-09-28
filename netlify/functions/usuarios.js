import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function makeStore(name){
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function verify(token){
  if(!token) return null;
  const parts=token.split('.'); if(parts.length!==3) return null;
  const data=parts[0]+'.'+parts[1];
  const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest());
  if(sig!==parts[2]) return null;
  let payload; try{ payload=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; }
  if(payload.exp && Math.floor(Date.now()/1000)>payload.exp) return null;
  return payload;
}
function hashPw(password,salt){ salt=salt||crypto.randomBytes(16).toString('hex'); const hash=crypto.scryptSync(String(password),salt,64).toString('hex'); return {salt,hash}; }
async function getUser(store,em){ try{ return await store.get(String(em).toLowerCase(),{type:'json'}); }catch(e){ return null; } }

export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const auth=(event.headers.authorization||event.headers.Authorization||'').replace('Bearer ','');
  const p=verify(auth);
  if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
  if(p.role!=='administracion') return {statusCode:403,headers,body:JSON.stringify({error:'Requiere rol administración'})};

  const store=makeStore('pasem-usuarios');
  const ok=()=>({statusCode:200,headers,body:JSON.stringify({ok:true})});
  try{
    if(event.httpMethod==='GET'){
      const {blobs}=await store.list();
      const items=await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})));
      const users=items.filter(Boolean).map(u=>({email:u.email,role:u.role}));
      users.sort((a,b)=>String(a.email).localeCompare(String(b.email)));
      return {statusCode:200,headers,body:JSON.stringify(users)};
    }
    if(event.httpMethod==='POST'){
      const body=JSON.parse(event.body||'{}');
      const action=body.action;
      const em=String(body.email||'').toLowerCase().trim();
      const role=body.role==='administracion'?'administracion':'operacion';

      if(action==='create'){
        if(!em) throw new Error('Falta el correo');
        if(!body.password || String(body.password).length<6) throw new Error('La contraseña debe tener al menos 6 caracteres');
        const {salt,hash}=hashPw(body.password);
        await store.setJSON(em,{email:em,salt,hash,role,createdAt:new Date().toISOString()});
        return ok();
      }
      if(action==='setrole'){
        const u=await getUser(store,em); if(!u) throw new Error('Usuario no encontrado');
        u.role=role; await store.setJSON(em,u); return ok();
      }
      if(action==='setpassword'){
        const u=await getUser(store,em); if(!u) throw new Error('Usuario no encontrado');
        if(!body.password || String(body.password).length<6) throw new Error('La contraseña debe tener al menos 6 caracteres');
        const {salt,hash}=hashPw(body.password); u.salt=salt; u.hash=hash; await store.setJSON(em,u); return ok();
      }
      if(action==='delete'){
        if(em===String(p.email).toLowerCase()) throw new Error('No puedes eliminar tu propia cuenta');
        await store.delete(em); return ok();
      }
      throw new Error('Acción no reconocida');
    }
    return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
