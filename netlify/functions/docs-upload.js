import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }
const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function verify(token){ if(!token) return null; const parts=token.split('.'); if(parts.length!==3) return null; const data=parts[0]+'.'+parts[1]; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); if(sig!==parts[2]) return null; let p; try{ p=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; } if(p.exp&&Math.floor(Date.now()/1000)>p.exp) return null; return p; }

const ALLOWED={ 'pasem-prov-docs':1, 'pasem-orden-docs':1 };

// Subida/lectura autenticada de documentos (proveedores y órdenes), por partes, a Netlify Blobs.
export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
  if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
  if(!(p.role==='administracion'||p.role==='operacion')) return {statusCode:403,headers,body:JSON.stringify({error:'Sin rol'})};
  try{
    if(event.httpMethod==='GET'){
      const qp=event.queryStringParameters||{};
      const storeName=String(qp.store||''); if(!ALLOWED[storeName]) return {statusCode:400,headers,body:JSON.stringify({error:'Almacén no permitido'})};
      if(!qp.doc) return {statusCode:400,headers,body:JSON.stringify({error:'Falta doc'})};
      const store=makeStore(storeName);
      const meta=await store.get('meta:'+qp.doc,{type:'json'}); if(!meta) return {statusCode:404,headers,body:JSON.stringify({error:'Documento no encontrado'})};
      let b64=''; for(let i=0;i<(meta.chunks||1);i++){ const c=await store.get('chunk:'+qp.doc+':'+i,{type:'text'}); if(c) b64+=c; }
      return {statusCode:200,headers,body:JSON.stringify({filename:meta.filename,type:meta.type,data:b64})};
    }
    if(event.httpMethod==='POST'){
      const body=JSON.parse(event.body||'{}');
      const storeName=String(body.store||''); if(!ALLOWED[storeName]) return {statusCode:400,headers,body:JSON.stringify({error:'Almacén no permitido'})};
      const store=makeStore(storeName);
      if(body.action==='init'){
        const chunks=Number(body.chunks||1);
        if(!(chunks>=1 && chunks<=40)) return {statusCode:400,headers,body:JSON.stringify({error:'Número de partes inválido'})};
        const size=Number(body.size||0); if(size>16_000_000) return {statusCode:413,headers,body:JSON.stringify({error:'El archivo supera el máximo permitido (15 MB).'})};
        const fn=String(body.filename||'').toLowerCase(); const type=String(body.type||'').toLowerCase();
        const okExt=/\.(pdf|xml|jpg|jpeg|png|webp)$/.test(fn);
        const okType=!type || /pdf|xml|image\//.test(type);
        if(!(okExt||okType)) return {statusCode:400,headers,body:JSON.stringify({error:'Tipo de archivo no permitido. Usa PDF, XML o imagen.'})};
        const docId=crypto.randomUUID();
        await store.setJSON('meta:'+docId, { id:docId, filename:String(body.filename||'documento').slice(0,160), type:String(body.type||'application/octet-stream').slice(0,80), size:Number(body.size||0), chunks, createdAt:new Date().toISOString(), subidoPor:p.email||'usuario' });
        return {statusCode:200,headers,body:JSON.stringify({docId})};
      }
      if(body.action==='chunk'){
        if(!body.docId || body.index==null || body.data==null) return {statusCode:400,headers,body:JSON.stringify({error:'Parte incompleta'})};
        if(String(body.data).length > 4_000_000) return {statusCode:413,headers,body:JSON.stringify({error:'Parte demasiado grande'})};
        await store.set('chunk:'+body.docId+':'+Number(body.index), String(body.data));
        return {statusCode:200,headers,body:JSON.stringify({ok:true})};
      }
      if(body.action==='delete'){
        if(!body.docId) return {statusCode:400,headers,body:JSON.stringify({error:'Falta docId'})};
        const meta=await store.get('meta:'+body.docId,{type:'json'});
        const n=meta?(meta.chunks||1):40;
        for(let i=0;i<n;i++){ await store.delete('chunk:'+body.docId+':'+i); }
        await store.delete('meta:'+body.docId);
        return {statusCode:200,headers,body:JSON.stringify({ok:true})};
      }
      return {statusCode:400,headers,body:JSON.stringify({error:'Acción no válida'})};
    }
    return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
