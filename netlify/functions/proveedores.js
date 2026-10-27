import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }
const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function verify(token){ if(!token) return null; const parts=token.split('.'); if(parts.length!==3) return null; const data=parts[0]+'.'+parts[1]; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); if(sig!==parts[2]) return null; let p; try{ p=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; } if(p.exp&&Math.floor(Date.now()/1000)>p.exp) return null; return p; }

// Gestión de proveedores: SOLO administración.
export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
  if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
  const canUse=(p.role==='administracion'||p.role==='operacion');
  if(!canUse) return {statusCode:403,headers,body:JSON.stringify({error:'Sin rol asignado'})};
  // Gestión (crear/editar/eliminar) solo administración; lectura (GET) permitida a operación.
  if(event.httpMethod!=='GET' && p.role!=='administracion') return {statusCode:403,headers,body:JSON.stringify({error:'Solo administración gestiona proveedores'})};
  const store=makeStore('pasem-proveedores');
  try{
    if(event.httpMethod==='GET'){
      const {blobs}=await store.list({prefix:'prov:'});
      let items=(await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})))).filter(Boolean);
      items.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      return {statusCode:200,headers,body:JSON.stringify(items)};
    }
    if(event.httpMethod==='POST'){
      const data=JSON.parse(event.body||'{}');
      if(data.action==='delete'){
        if(!data.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
        await store.delete('prov:'+data.id);
        return {statusCode:200,headers,body:JSON.stringify({ok:true})};
      }
      if(data.action==='update'){
        if(!data.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
        const rec=await store.get('prov:'+data.id,{type:'json'}); if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Proveedor no encontrado'})};
        const patch={...data}; delete patch.action;
        const merged={...rec, ...patch, id:rec.id, createdAt:rec.createdAt, editadoPor:p.email||'usuario', editadoAt:new Date().toISOString()};
        await store.setJSON('prov:'+rec.id, merged);
        return {statusCode:200,headers,body:JSON.stringify(merged)};
      }
      // crear
      const id=crypto.randomUUID();
      const rec={...data, id, createdAt:new Date().toISOString(), capturadoPor:p.email||'usuario'};
      delete rec.action;
      await store.setJSON('prov:'+id, rec);
      return {statusCode:200,headers,body:JSON.stringify(rec)};
    }
    return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
