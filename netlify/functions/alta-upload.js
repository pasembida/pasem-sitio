import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }

// Subida pública de documentos del alta, por partes, a Netlify Blobs.
export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  if(event.httpMethod!=='POST') return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  const store=makeStore('pasem-altas-docs');
  try{
    const body=JSON.parse(event.body||'{}');
    if(body.action==='init'){
      const chunks=Number(body.chunks||1);
      if(!(chunks>=1 && chunks<=40)) return {statusCode:400,headers,body:JSON.stringify({error:'Número de partes inválido'})};
      const docId=crypto.randomUUID();
      await store.setJSON('meta:'+docId, {
        id:docId,
        filename:String(body.filename||'documento').slice(0,160),
        type:String(body.type||'application/octet-stream').slice(0,80),
        size:Number(body.size||0),
        chunks,
        createdAt:new Date().toISOString()
      });
      return {statusCode:200,headers,body:JSON.stringify({docId})};
    }
    if(body.action==='chunk'){
      if(!body.docId || body.index==null || body.data==null) return {statusCode:400,headers,body:JSON.stringify({error:'Parte incompleta'})};
      if(String(body.data).length > 4_000_000) return {statusCode:413,headers,body:JSON.stringify({error:'Parte demasiado grande'})};
      await store.set('chunk:'+body.docId+':'+Number(body.index), String(body.data));
      return {statusCode:200,headers,body:JSON.stringify({ok:true})};
    }
    return {statusCode:400,headers,body:JSON.stringify({error:'Acción no válida'})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
