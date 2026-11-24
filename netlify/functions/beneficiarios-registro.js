import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }

async function resolveToken(t){
  if(!t) return null;
  try{ const bl=makeStore('pasem-benlinks'); return await bl.get('tok:'+String(t), {type:'json'}); }catch(e){ return null; }
}

export const handler = async (event) => {
  const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*'};

  // GET ?t=token -> info del titular + beneficiarios ya registrados
  if(event.httpMethod==='GET'){
    const t=(event.queryStringParameters||{}).t;
    const info=await resolveToken(t);
    if(!info) return {statusCode:404,headers,body:JSON.stringify({error:'Liga no válida o expirada.'})};
    let benef=[];
    try{
      const ds=makeStore('pasem-dependientes'); const {blobs}=await ds.list();
      const all=(await Promise.all(blobs.map(b=>ds.get(b.key,{type:'json'})))).filter(Boolean);
      benef=all.filter(d=>String(d.titularCert||'').toUpperCase()===String(info.cert).toUpperCase())
               .map(d=>({ id:d.id, cert:d.cert, nombre:d.nombre, parentesco:d.parentesco, curp:d.curp, docs:(d.docs||[]).length }))
               .sort((a,b)=>String(a.cert||'').localeCompare(String(b.cert||'')));
    }catch(e){}
    return {statusCode:200,headers,body:JSON.stringify({ ok:true, titularNombre:info.titularNombre||'', cert:info.cert, beneficiarios:benef })};
  }

  if(event.httpMethod!=='POST') return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  let body={}; try{ body=JSON.parse(event.body||'{}'); }catch(e){ return {statusCode:400,headers,body:JSON.stringify({error:'JSON inválido'})}; }
  const info=await resolveToken(body.t);
  if(!info) return {statusCode:404,headers,body:JSON.stringify({error:'Liga no válida o expirada.'})};
  const cert=String(info.cert).toUpperCase();
  const ds=makeStore('pasem-dependientes');

  // Agregar beneficiario
  if(body.action==='add'){
    const b=body.beneficiario||{};
    const nombre=String(b.nombre||'').trim();
    const curp=String(b.curp||'').trim().toUpperCase();
    const parentesco=String(b.parentesco||'').trim();
    if(!nombre || !parentesco) return {statusCode:400,headers,body:JSON.stringify({error:'Faltan datos del beneficiario (nombre y parentesco).'})};
    const {blobs}=await ds.list();
    const all=(await Promise.all(blobs.map(x=>ds.get(x.key,{type:'json'})))).filter(Boolean);
    if(curp){ const dup=all.find(d=>String(d.titularCert||'').toUpperCase()===cert && String(d.curp||'').trim().toUpperCase()===curp); if(dup) return {statusCode:409,headers,body:JSON.stringify({error:'Ese beneficiario (CURP '+curp+') ya está registrado.', cert:dup.cert})}; }
    // asignar letra (A, B, C...)
    const used=all.filter(d=>String(d.titularCert||'').toUpperCase()===cert).map(d=>String(d.cert||'').slice(cert.length));
    let letter=''; for(let code=65;code<=90;code++){ const L=String.fromCharCode(code); if(used.indexOf(L)<0){ letter=L; break; } }
    const id=crypto.randomUUID();
    const dep={ id, cert:cert+letter, titularCert:cert, titularNombre:info.titularNombre||'',
      nombre, curp, rfc:String(b.rfc||'').trim().toUpperCase(), parentesco,
      fechaNacimiento:String(b.fechaNacimiento||''), sexo:String(b.sexo||''), estudia:String(b.estudia||''),
      docs:Array.isArray(body.docs)?body.docs:[], programa:'telesecundaria', origen:'registro-voluntario',
      createdAt:new Date().toISOString(), capturadoPor:'beneficiario-liga' };
    await ds.setJSON(id, dep);
    return {statusCode:200,headers,body:JSON.stringify({ ok:true, cert:dep.cert, id:dep.id })};
  }

  // Eliminar un beneficiario (desde la misma liga del titular)
  if(body.action==='delete'){
    if(!body.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
    const rec=await ds.get(body.id,{type:'json'});
    if(!rec || String(rec.titularCert||'').toUpperCase()!==cert) return {statusCode:404,headers,body:JSON.stringify({error:'Beneficiario no encontrado para esta liga.'})};
    try{ await ds.delete(body.id); }catch(e){}
    return {statusCode:200,headers,body:JSON.stringify({ ok:true, deleted:body.id })};
  }

  return {statusCode:400,headers,body:JSON.stringify({error:'Acción no válida'})};
};
