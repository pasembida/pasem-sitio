import { getStore } from '@netlify/blobs';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }
function docLabel(fn){ fn=String(fn||''); var parts=fn.split(' — '); if(parts.length>1 && /\.(pdf|jpe?g|png|docx?|xlsx?|heic)$/i.test(parts[parts.length-1].trim())) parts.pop(); return parts.join(' — ')||fn; }
async function resolveToken(t){ if(!t) return null; try{ const cl=makeStore('pasem-correc'); return await cl.get('tok:'+String(t), {type:'json'}); }catch(e){ return null; } }

export const handler = async (event) => {
  const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*'};
  const store=makeStore('pasem-registros');

  if(event.httpMethod==='GET'){
    const t=(event.queryStringParameters||{}).t;
    const info=await resolveToken(t); if(!info) return {statusCode:404,headers,body:JSON.stringify({error:'Liga de corrección no válida.'})};
    const rec=await store.get('reg:'+info.registroId,{type:'json'}); if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Registro no encontrado.'})};
    const f=rec.fields||{};
    const rech=(rec.docsRechazados||[]).map(dId=>{ const d=(rec.docs||[]).find(x=>x.docId===dId); return d?docLabel(d.filename):''; }).filter(Boolean);
    return {statusCode:200,headers,body:JSON.stringify({ ok:true, titularNombre:f['Nombre completo']||'', modalidad:f['Modalidad']||'', tipo:f['Tipo de plaza']||'', estado:rec.estado||'', observaciones:rec.observaciones||'', docsRechazados:rech })};
  }

  if(event.httpMethod!=='POST') return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  let body={}; try{ body=JSON.parse(event.body||'{}'); }catch(e){ return {statusCode:400,headers,body:JSON.stringify({error:'JSON inválido'})}; }
  const info=await resolveToken(body.t); if(!info) return {statusCode:404,headers,body:JSON.stringify({error:'Liga de corrección no válida.'})};
  const rec=await store.get('reg:'+info.registroId,{type:'json'}); if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Registro no encontrado.'})};

  if(body.action==='corregir'){
    const nuevos=Array.isArray(body.docs)?body.docs:[];
    if(!nuevos.length) return {statusCode:400,headers,body:JSON.stringify({error:'No enviaste documentos.'})};
    let docs=Array.isArray(rec.docs)?rec.docs.slice():[];
    // Reemplazar por etiqueta: quita los que tengan la misma etiqueta y agrega los nuevos
    nuevos.forEach(nd=>{ const lbl=docLabel(nd.filename); docs=docs.filter(od=>docLabel(od.filename)!==lbl); docs.push(nd); });
    rec.docs=docs; rec.estado='en-revision'; rec.docsRechazados=[]; rec.corregidoAt=new Date().toISOString();
    rec.historial=Array.isArray(rec.historial)?rec.historial:[]; rec.historial.push({ tipo:'corregido', at:rec.corregidoAt, docs:nuevos.map(x=>docLabel(x.filename)) });
    await store.setJSON('reg:'+rec.id, rec);
    return {statusCode:200,headers,body:JSON.stringify({ ok:true })};
  }
  return {statusCode:400,headers,body:JSON.stringify({error:'Acción no válida'})};
};
