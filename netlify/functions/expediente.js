import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function verify(token){ if(!token) return null; const parts=token.split('.'); if(parts.length!==3) return null; const data=parts[0]+'.'+parts[1]; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); if(sig!==parts[2]) return null; let p; try{ p=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; } if(p.exp&&Math.floor(Date.now()/1000)>p.exp) return null; return p; }
function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
  if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
  const isAdmin=p.role==='administracion';
  if(!(isAdmin||p.role==='operacion')) return {statusCode:403,headers,body:JSON.stringify({error:'Sin rol asignado'})};
  const store=makeStore('pasem-expedientes');
  try{
    if(event.httpMethod==='GET'){
      const qp=event.queryStringParameters||{};
      if(qp.id && qp.chunk!=null){
        const data=await store.get('chunk:'+qp.id+':'+qp.chunk,{type:'text'});
        if(data==null) return {statusCode:404,headers,body:JSON.stringify({error:'Parte no encontrada'})};
        return {statusCode:200,headers,body:JSON.stringify({data})};
      }
      if(qp.id){
        const meta=await store.get('meta:'+qp.id,{type:'json'});
        if(!meta) return {statusCode:404,headers,body:JSON.stringify({error:'Documento no encontrado'})};
        return {statusCode:200,headers,body:JSON.stringify({id:meta.id,filename:meta.filename,mime:meta.mime,chunks:meta.chunks||1,ref:meta.ref})};
      }
      const q=norm(qp.q||'');
      const { blobs }=await store.list({ prefix:'meta:' });
      let metas=await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})));
      metas=metas.filter(Boolean);
      if(q){ metas=metas.filter(m=> norm([m.filename,m.ref,m.desc,m.uploadedBy].join(' ')).indexOf(q)>=0); }
      metas.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      return {statusCode:200,headers,body:JSON.stringify(metas)};
    }
    if(event.httpMethod==='POST'){
      const body=JSON.parse(event.body||'{}');
      if(body.action==='chunk'){
        if(!body.uploadId || body.index==null || body.data==null) return {statusCode:400,headers,body:JSON.stringify({error:'Datos de parte incompletos'})};
        await store.set('chunk:'+body.uploadId+':'+body.index, String(body.data));
        return {statusCode:200,headers,body:JSON.stringify({ok:true})};
      }
      if(body.action==='finalize'){
        if(!body.uploadId || !body.total) return {statusCode:400,headers,body:JSON.stringify({error:'Finalización incompleta'})};
        const meta={ id:body.uploadId, filename:body.filename||'documento', mime:body.mime||'application/octet-stream', ref:body.ref||'', desc:body.desc||'', chunks:parseInt(body.total,10)||1, uploadedBy:p.email||'usuario', createdAt:new Date().toISOString() };
        await store.setJSON('meta:'+body.uploadId, meta);
        return {statusCode:200,headers,body:JSON.stringify({ok:true, id:body.uploadId})};
      }
      // compatibilidad: subida directa en una sola llamada (archivos pequeños)
      if(body.action==='upload'){
        if(!body.data) return {statusCode:400,headers,body:JSON.stringify({error:'Falta el archivo'})};
        const id='DOC-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,7).toUpperCase();
        await store.set('chunk:'+id+':0', String(body.data));
        const meta={ id, filename:body.filename||'documento', mime:body.mime||'application/octet-stream', ref:body.ref||'', desc:body.desc||'', chunks:1, uploadedBy:p.email||'usuario', createdAt:new Date().toISOString() };
        await store.setJSON('meta:'+id, meta);
        return {statusCode:200,headers,body:JSON.stringify({ok:true, id})};
      }
      if(body.action==='delete'){
        if(!isAdmin) return {statusCode:403,headers,body:JSON.stringify({error:'Solo administración puede eliminar'})};
        if(!body.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
        const meta=await store.get('meta:'+body.id,{type:'json'});
        const n=(meta&&meta.chunks)||1;
        for(let i=0;i<n;i++){ await store.delete('chunk:'+body.id+':'+i); }
        await store.delete('meta:'+body.id);
        return {statusCode:200,headers,body:JSON.stringify({ok:true})};
      }
      return {statusCode:400,headers,body:JSON.stringify({error:'Acción no reconocida'})};
    }
    return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
