import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }

// Subida pública de documentos del alta, por partes, a Netlify Blobs.
export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  if(event.httpMethod!=='POST') return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  const store=makeStore('pasem-reg-docs');
  try{
    const body=JSON.parse(event.body||'{}');
    if(body.action==='init'){
      const chunks=Number(body.chunks||1);
      if(!(chunks>=1 && chunks<=40)) return {statusCode:400,headers,body:JSON.stringify({error:'Número de partes inválido'})};
      // Validar tipo permitido (PDF, JPG, PNG) y tamaño (máx. 10 MB reales)
      const fn=String(body.filename||'').toLowerCase();
      const ext=fn.split('.').pop();
      const mime=String(body.type||'').toLowerCase();
      const okType=(['pdf','jpg','jpeg','png'].indexOf(ext)>=0) || /^(image\/(jpeg|png)|application\/pdf)$/.test(mime);
      if(!okType) return {statusCode:400,headers,body:JSON.stringify({error:'Formato no permitido. Solo PDF, JPG o PNG.'})};
      const b64len=Number(body.size||0);           // longitud del base64
      const realBytes=Math.floor(b64len*3/4);       // tamaño real aproximado
      if(realBytes>10*1024*1024) return {statusCode:400,headers,body:JSON.stringify({error:'El archivo excede 10 MB.'})};
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
