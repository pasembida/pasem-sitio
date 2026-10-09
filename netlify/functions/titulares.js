import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import DATA from './lib/beneficiarios.json';
const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function verify(token){ if(!token) return null; const parts=token.split('.'); if(parts.length!==3) return null; const data=parts[0]+'.'+parts[1]; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); if(sig!==parts[2]) return null; let p; try{ p=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; } if(p.exp&&Math.floor(Date.now()/1000)>p.exp) return null; return p; }
function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
const STATIC_MAX=DATA.length; // 3457

export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
  if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
  const isAdmin=p.role==='administracion';
  if(!(isAdmin||p.role==='operacion')) return {statusCode:403,headers,body:JSON.stringify({error:'Sin rol asignado'})};
  const store=makeStore('pasem-titulares');
  try{
    if(event.httpMethod==='GET'){
      const q=norm((event.queryStringParameters&&event.queryStringParameters.q)||'');
      const {blobs}=await store.list();
      let items=await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})));
      items=items.filter(Boolean);
      if(q) items=items.filter(t=> norm([t.cert,t.nombre,t.curp,t.rfc,t.cct,t.ct].join(' ')).indexOf(q)>=0);
      items.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      return {statusCode:200,headers,body:JSON.stringify(items)};
    }
    if(event.httpMethod==='POST'){
      const body=JSON.parse(event.body||'{}');
      if(body.action==='create'){
        if(!body.nombre) return {statusCode:400,headers,body:JSON.stringify({error:'Falta el nombre'})};
        const {blobs}=await store.list();
        const all=(await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})))).filter(Boolean);
        let maxN=STATIC_MAX;
        all.forEach(t=>{ const m=/PASEM-(\d+)/.exec(String(t.cert||'')); if(m){ const n=parseInt(m[1],10); if(!isNaN(n)) maxN=Math.max(maxN,n); } });
        const n=maxN+1; const cert='PASEM-'+String(n).padStart(5,'0');
        const id='TIT-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
        const t=Object.assign({}, body, { id, cert, createdAt:new Date().toISOString(), capturadoPor:p.email||'usuario' }); delete t.action;
        await store.setJSON(id,t);
        return {statusCode:200,headers,body:JSON.stringify(t)};
      }
      if(body.action==='delete'){
        if(!isAdmin) return {statusCode:403,headers,body:JSON.stringify({error:'Solo administración'})};
        await store.delete(body.id);
        return {statusCode:200,headers,body:JSON.stringify({ok:true})};
      }
      return {statusCode:400,headers,body:JSON.stringify({error:'Acción no reconocida'})};
    }
    return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
