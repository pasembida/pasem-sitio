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
function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const auth=(event.headers.authorization||event.headers.Authorization||'').replace('Bearer ','');
  const p=verify(auth);
  if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
  const isAdmin=p.role==='administracion';
  if(!(isAdmin||p.role==='operacion')) return {statusCode:403,headers,body:JSON.stringify({error:'Sin rol asignado'})};

  const store=makeStore('pasem-expedientes'); // metadatos en meta:<id>, archivo en file:<id>
  try{
    if(event.httpMethod==='GET'){
      const id=event.queryStringParameters && event.queryStringParameters.id;
      if(id){
        const meta=await store.get('meta:'+id,{type:'json'});
        const data=await store.get('file:'+id,{type:'text'});
        if(!meta||data==null) return {statusCode:404,headers,body:JSON.stringify({error:'Documento no encontrado'})};
        return {statusCode:200,headers,body:JSON.stringify({ id, filename:meta.filename, mime:meta.mime, data })};
      }
      const q=norm((event.queryStringParameters&&event.queryStringParameters.q)||'');
      const { blobs } = await store.list({ prefix:'meta:' });
      let metas=await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})));
      metas=metas.filter(Boolean);
      if(q){ metas=metas.filter(m=> norm([m.filename,m.ref,m.desc,m.uploadedBy].join(' ')).indexOf(q)>=0); }
      metas.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      return {statusCode:200,headers,body:JSON.stringify(metas)};
    }
    if(event.httpMethod==='POST'){
      const body=JSON.parse(event.body||'{}');
      if(body.action==='upload'){
        if(!body.data) return {statusCode:400,headers,body:JSON.stringify({error:'Falta el archivo'})};
        const id='DOC-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,7).toUpperCase();
        const meta={ id, filename:body.filename||'documento', mime:body.mime||'application/octet-stream', ref:body.ref||'', desc:body.desc||'', uploadedBy:p.email||'usuario', createdAt:new Date().toISOString() };
        await store.set('file:'+id, String(body.data));
        await store.setJSON('meta:'+id, meta);
        return {statusCode:200,headers,body:JSON.stringify({ok:true, id})};
      }
      if(body.action==='delete'){
        if(!isAdmin) return {statusCode:403,headers,body:JSON.stringify({error:'Solo administración puede eliminar'})};
        if(!body.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
        await store.delete('file:'+body.id);
        await store.delete('meta:'+body.id);
        return {statusCode:200,headers,body:JSON.stringify({ok:true})};
      }
      return {statusCode:400,headers,body:JSON.stringify({error:'Acción no reconocida'})};
    }
    return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
