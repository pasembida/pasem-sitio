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
function sign(payload){
  const h=b64url(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const p=b64url(JSON.stringify(payload));
  const data=h+'.'+p;
  const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest());
  return data+'.'+sig;
}
export function verify(token){
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
function checkPw(password,salt,hash){ try{ const h=crypto.scryptSync(String(password),salt,64).toString('hex'); const a=Buffer.from(h),b=Buffer.from(hash); return a.length===b.length && crypto.timingSafeEqual(a,b); }catch(e){ return false; } }
async function getUser(store,em){ try{ return await store.get(String(em).toLowerCase(),{type:'json'}); }catch(e){ return null; } }

async function ensureSeed(store){
  const em=(process.env.SEED_ADMIN_EMAIL||'').toLowerCase().trim();
  const pw=process.env.SEED_ADMIN_PASSWORD||'';
  if(!em||!pw) return;
  const ex=await getUser(store,em);
  if(!ex){
    const {salt,hash}=hashPw(pw);
    await store.setJSON(em,{email:em,salt,hash,role:'administracion',createdAt:new Date().toISOString()});
    return;
  }
  if(!checkPw(pw, ex.salt, ex.hash)){
    const {salt,hash}=hashPw(pw);
    ex.salt=salt; ex.hash=hash; ex.role='administracion';
    await store.setJSON(em,ex);
  }
}

export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const store=makeStore('pasem-usuarios');
  try{
    if(event.httpMethod!=='POST') return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
    const body=JSON.parse(event.body||'{}');

    if(body.action==='login'){
      await ensureSeed(store);
      const em=String(body.email||'').toLowerCase().trim();
      const u=await getUser(store,em);
      if(!u || !checkPw(body.password||'',u.salt,u.hash)) return {statusCode:401,headers,body:JSON.stringify({error:'Correo o contraseña incorrectos'})};
      const token=sign({email:u.email,role:u.role,exp:Math.floor(Date.now()/1000)+60*60*8});
      return {statusCode:200,headers,body:JSON.stringify({token,email:u.email,role:u.role})};
    }

    if(body.action==='change'){
      const auth=(event.headers.authorization||event.headers.Authorization||'').replace('Bearer ','');
      const p=verify(auth);
      if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
      if(!body.password || String(body.password).length<6) return {statusCode:400,headers,body:JSON.stringify({error:'La contraseña debe tener al menos 6 caracteres'})};
      const u=await getUser(store,p.email);
      if(!u) return {statusCode:404,headers,body:JSON.stringify({error:'Usuario no encontrado'})};
      const {salt,hash}=hashPw(body.password); u.salt=salt; u.hash=hash;
      await store.setJSON(String(u.email).toLowerCase(),u);
      return {statusCode:200,headers,body:JSON.stringify({ok:true})};
    }

    return {statusCode:400,headers,body:JSON.stringify({error:'Acción no reconocida'})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
