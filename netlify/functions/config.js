import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }
const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function verify(token){ if(!token) return null; const parts=token.split('.'); if(parts.length!==3) return null; const data=parts[0]+'.'+parts[1]; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); if(sig!==parts[2]) return null; let p; try{ p=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; } if(p.exp&&Math.floor(Date.now()/1000)>p.exp) return null; return p; }
const parseMoney=v=>{ const n=Number(String(v==null?'':v).replace(/[^0-9.]/g,'')); return isFinite(n)?n:0; };

// Configuración del sistema (cuota pendiente del contrato, etc.)
export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
  if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
  const store=makeStore('pasem-config');
  try{
    if(event.httpMethod==='GET'){
      const cfg=(await store.get('config',{type:'json'}))||{};
      const cuotaDef=(cfg.cuota==null?3123000:Number(cfg.cuota));
      return {statusCode:200,headers,body:JSON.stringify({ cuota:cuotaDef, contrato:cfg.contrato||'SLP', updatedAt:cfg.updatedAt||'' })};
    }
    if(event.httpMethod==='POST'){
      if(p.role!=='administracion') return {statusCode:403,headers,body:JSON.stringify({error:'Solo administración puede editar la configuración'})};
      const body=JSON.parse(event.body||'{}');
      const cfg=(await store.get('config',{type:'json'}))||{};
      if(body.cuota!=null) cfg.cuota=parseMoney(body.cuota);
      if(body.contrato!=null) cfg.contrato=String(body.contrato).slice(0,40);
      cfg.updatedAt=new Date().toISOString(); cfg.updatedBy=p.email||'usuario';
      await store.setJSON('config', cfg);
      return {statusCode:200,headers,body:JSON.stringify({ ok:true, cuota:Number(cfg.cuota||0), contrato:cfg.contrato||'SLP' })};
    }
    return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
