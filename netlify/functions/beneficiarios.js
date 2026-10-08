import crypto from 'node:crypto';
import DATA from './lib/beneficiarios.json';
import { getStore } from '@netlify/blobs';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }

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
function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

// índice de búsqueda precalculado (nombre + rfc + curp + clave)
const INDEX = DATA.map(x => norm([x.n,x.r,x.c,x.k].join(' ')));

export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const auth=(event.headers.authorization||event.headers.Authorization||'').replace('Bearer ','');
  const p=verify(auth);
  if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
  if(!(p.role==='administracion'||p.role==='operacion')) return {statusCode:403,headers,body:JSON.stringify({error:'Sin rol asignado'})};

  const q=norm((event.queryStringParameters&&event.queryStringParameters.q)||'').trim();
  if(q.length<2) return {statusCode:200,headers,body:JSON.stringify({total:DATA.length, count:0, results:[]})};

  const terms=q.split(/\s+/).filter(Boolean);
  function matchAll(hay){ for(const t of terms){ if(hay.indexOf(t)<0) return false; } return true; }
  const results=[];
  for(let i=0;i<INDEX.length && results.length<100;i++){
    if(matchAll(INDEX[i])){ const x=DATA[i]; results.push({cert:x.ce,tipo:'Titular',nombre:x.n,rfc:x.r,curp:x.c,funcion:x.f,cct:x.cct,ct:x.t,nivel:x.nv}); }
  }
  // dependientes dados de alta
  try{
    const dstore=makeStore('pasem-dependientes');
    const { blobs }=await dstore.list();
    const deps=(await Promise.all(blobs.map(b=>dstore.get(b.key,{type:'json'})))).filter(Boolean);
    for(const d of deps){
      if(results.length>=150) break;
      const hay=norm([d.cert,d.nombre,d.curp,d.rfc,d.titularCert,d.titularNombre,d.parentesco].join(' '));
      if(matchAll(hay)){ results.push({cert:d.cert,tipo:'Dependiente',nombre:d.nombre,rfc:d.rfc,curp:d.curp,funcion:d.parentesco,cct:'',ct:'Titular: '+(d.titularNombre||d.titularCert),nivel:''}); }
    }
  }catch(e){}
  return {statusCode:200,headers,body:JSON.stringify({total:DATA.length, count:results.length, results})};
};
