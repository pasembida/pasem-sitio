import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function verify(token){ if(!token) return null; const parts=token.split('.'); if(parts.length!==3) return null; const data=parts[0]+'.'+parts[1]; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); if(sig!==parts[2]) return null; let p; try{ p=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; } if(p.exp&&Math.floor(Date.now()/1000)>p.exp) return null; return p; }
function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
const TIPO_CODE={ 'CIRUGIA':'CIR', 'APOYO PARTO O CESAREA':'PAR', 'CONSULTA MEDICO GENERAL':'CGE', 'CONSULTA ESPECIALISTA':'CES', 'ESTUDIO LABORATORIO':'LAB' };

export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
  if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
  const isAdmin=p.role==='administracion';
  if(!(isAdmin||p.role==='operacion')) return {statusCode:403,headers,body:JSON.stringify({error:'Sin rol asignado'})};
  const store=makeStore('pasem-solicitudes');
  try{
    if(event.httpMethod==='GET'){
      const id=event.queryStringParameters && event.queryStringParameters.id;
      if(id){ const s=await store.get(id,{type:'json'}); if(!s) return {statusCode:404,headers,body:JSON.stringify({error:'No encontrada'})}; return {statusCode:200,headers,body:JSON.stringify(s)}; }
      const q=norm((event.queryStringParameters&&event.queryStringParameters.q)||'');
      const {blobs}=await store.list();
      let items=await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})));
      items=items.filter(Boolean);
      if(q) items=items.filter(s=> norm([s.folio,s.folioEleonor,s.nombre,s.curp,s.rfc,s.certificado,s.tipoTramite].join(' ')).indexOf(q)>=0);
      items.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      return {statusCode:200,headers,body:JSON.stringify(items)};
    }
    if(event.httpMethod==='POST'){
      const body=JSON.parse(event.body||'{}');
      if(body.action==='create'){
        const cert=String(body.certificado||'').trim().toUpperCase();
        const tipo=String(body.tipoTramite||'').trim().toUpperCase();
        if(!cert) return {statusCode:400,headers,body:JSON.stringify({error:'Relaciona el certificado del beneficiario (búscalo en la base con la lupa) antes de generar el folio.'})};
        if(!tipo) return {statusCode:400,headers,body:JSON.stringify({error:'Selecciona el tipo de trámite.'})};
        const code=TIPO_CODE[tipo]||'GEN';
        // consecutivo por certificado + tipo, con blindaje contra colisiones
        const {blobs}=await store.list();
        const all=(await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})))).filter(Boolean);
        const prefix=cert+'-'+code+'-';
        let maxN=0;
        all.forEach(x=>{ if(typeof x.folio==='string' && x.folio.indexOf(prefix)===0){ const n=parseInt(x.folio.slice(prefix.length),10); if(!isNaN(n)) maxN=Math.max(maxN,n); } });
        const existing=new Set(all.map(x=>x.folio));
        let n=maxN+1, folio=prefix+String(n).padStart(3,'0');
        while(existing.has(folio)){ n++; folio=prefix+String(n).padStart(3,'0'); }
        const id='SOL-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
        const now=new Date().toISOString();
        const s={ id, folio, folioEleonor:body.folioEleonor||'', nombre:body.nombre||'', rfc:body.rfc||'', curp:body.curp||'', certificado:cert, tipoTramite:body.tipoTramite||'', comentarios:body.comentarios||'', estado:1, etapas:{'1':now}, autorizada:false, createdAt:now, capturadoPor:p.email||'usuario' };
        await store.setJSON(id,s);
        return {statusCode:200,headers,body:JSON.stringify(s)};
      }
      if(body.action==='stage'){
        const s=await store.get(body.id,{type:'json'}); if(!s) return {statusCode:404,headers,body:JSON.stringify({error:'No encontrada'})};
        const et=String(body.etapa); if(['1','2','3','4'].indexOf(et)<0) return {statusCode:400,headers,body:JSON.stringify({error:'Etapa inválida'})};
        s.etapas=s.etapas||{}; s.etapas[et]=new Date().toISOString(); s.estado=Math.max(s.estado||1, parseInt(et,10));
        await store.setJSON(s.id,s);
        return {statusCode:200,headers,body:JSON.stringify(s)};
      }
      if(body.action==='authorize'){
        const s=await store.get(body.id,{type:'json'}); if(!s) return {statusCode:404,headers,body:JSON.stringify({error:'No encontrada'})};
        s.autorizada=true; s.atencionId=body.atencionId||''; s.etapas=s.etapas||{}; if(!s.etapas['3']) s.etapas['3']=new Date().toISOString(); s.estado=Math.max(s.estado||1,3);
        await store.setJSON(s.id,s);
        return {statusCode:200,headers,body:JSON.stringify(s)};
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
