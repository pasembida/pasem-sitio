import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
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

export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const auth=(event.headers.authorization||event.headers.Authorization||'').replace('Bearer ','');
  const p=verify(auth);
  if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
  const isAdmin=p.role==='administracion';
  const canUse=isAdmin || p.role==='operacion';
  if(!canUse) return {statusCode:403,headers,body:JSON.stringify({error:'Sin rol asignado'})};

  const store=getStore('pasem-atenciones');
  try{
    if(event.httpMethod==='GET'){
      const {blobs}=await store.list();
      const items=await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})));
      const clean=items.filter(Boolean);
      clean.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      return {statusCode:200,headers,body:JSON.stringify(clean)};
    }
    if(event.httpMethod==='POST'){
      const data=JSON.parse(event.body||'{}');
      const id='PASEM-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,7).toUpperCase();
      const record={...data, id, createdAt:new Date().toISOString(), capturadoPor:p.email||'usuario'};
      await store.setJSON(id,record);
      return {statusCode:200,headers,body:JSON.stringify(record)};
    }
    if(event.httpMethod==='DELETE'){
      if(!isAdmin) return {statusCode:403,headers,body:JSON.stringify({error:'Solo administración puede eliminar'})};
      const id=event.queryStringParameters && event.queryStringParameters.id;
      if(!id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
      await store.delete(id);
      return {statusCode:200,headers,body:JSON.stringify({ok:true})};
    }
    return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
