import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }
const SECRET = process.env.SESSION_SECRET || 'pasem-secret-cambiar';
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function verify(token){ if(!token) return null; const parts=token.split('.'); if(parts.length!==3) return null; const data=parts[0]+'.'+parts[1]; const sig=b64url(crypto.createHmac('sha256',SECRET).update(data).digest()); if(sig!==parts[2]) return null; let p; try{ p=JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }catch(e){ return null; } if(p.exp&&Math.floor(Date.now()/1000)>p.exp) return null; return p; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
const parseMoney=v=>{ const n=Number(String(v==null?'':v).replace(/[^0-9.]/g,'')); return isFinite(n)?n:0; };
const money=n=>'$'+Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
const norm=s=>String(s==null?'':s).trim().toUpperCase();
async function readDoc(storeName, docId){
  if(!docId) return null;
  try{ const st=makeStore(storeName); const meta=await st.get('meta:'+docId,{type:'json'}); if(!meta) return null;
    let b64=''; for(let i=0;i<(meta.chunks||1);i++){ const c=await st.get('chunk:'+docId+':'+i,{type:'text'}); if(c) b64+=c; }
    if(!b64) return null; return { filename:meta.filename||'documento', content:b64, size:b64.length };
  }catch(e){ return null; }
}

function validar(o){
  const reserva=parseMoney(o.reserva);
  if(!(reserva>0)) return 'La autorización seleccionada no tiene Reserva capturada. No se puede registrar la orden hasta que tenga reserva.';
  const recs=Array.isArray(o.receptores)?o.receptores:[];
  const conMonto=recs.filter(r=>parseMoney(r.monto)>0);
  if(!conMonto.length) return 'Captura al menos un receptor con monto.';
  const suma=conMonto.reduce((a,r)=>a+parseMoney(r.monto),0);
  if(suma>reserva+0.001) return 'La suma de los pagos ('+money(suma)+') supera la Reserva disponible ('+money(reserva)+').';
  return null;
}

function correoHtml(o){
  const base=(process.env.SITE_URL||'https://pasem.com').replace(/\/$/,'');
  const snte=base+'/img/snte26.jpg', bida=base+'/img/bida.png';
  const recs=(o.receptores||[]).filter(r=>parseMoney(r.monto)>0);
  const total=recs.reduce((a,r)=>a+parseMoney(r.monto),0);
  const row=(k,v)=>'<tr><td style="padding:7px 10px;border-bottom:1px solid #E9EEF0;background:#FFF3EA;font-weight:700;font-size:13px;width:38%;">'+esc(k)+'</td><td style="padding:7px 10px;border-bottom:1px solid #E9EEF0;font-size:13px;">'+(v?esc(v):'—')+'</td></tr>';
  let recBlocks='';
  recs.forEach((r,i)=>{
    recBlocks+='<tr><td colspan="2" style="padding:9px 10px;background:#E6F6F6;color:#0E9A9C;font-weight:700;font-size:13px;">Receptor '+(i+1)+' · '+esc(r.tipo||'')+' — '+money(parseMoney(r.monto))+'</td></tr>'
      + row('Proveedor / Beneficiario del pago', r.nombre)
      + row('RFC', r.rfc)
      + row('Banco', r.banco)
      + row('Número de cuenta', r.cuenta)
      + row('CLABE', r.clabe)
      + (r.correo?row('Correo', r.correo):'')
      + (r.telefono?row('Teléfono', r.telefono):'')
      + row('Concepto', r.tipo)
      + row('Monto a pagar', money(parseMoney(r.monto)));
  });
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#EAF6F6;font-family:Arial,Helvetica,sans-serif;color:#1f3442;">'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF6F6;padding:18px 10px;"><tr><td align="center">'+
    '<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#fff;border:1px solid #D9E9E9;border-radius:12px;overflow:hidden;">'+
      '<tr><td style="padding:14px 18px;"><table role="presentation" width="100%"><tr><td align="left"><img src="'+snte+'" height="44" style="height:44px;"></td><td align="center" style="font-size:12px;color:#767676;">Programa de Apoyo de Servicios Médicos<br><span style="font-size:20px;font-weight:900;color:#DD6B20;">PASEM</span></td><td align="right"><img src="'+bida+'" height="44" style="height:44px;"></td></tr></table></td></tr>'+
      '<tr><td style="background:#DD6B20;padding:12px 18px;text-align:center;color:#fff;font-size:18px;font-weight:800;">Solicitud de Orden de Pago</td></tr>'+
      '<tr><td style="height:4px;background:#14B4B6;font-size:0;line-height:0;">&nbsp;</td></tr>'+
      '<tr><td style="padding:14px 18px 6px;"><div style="font-size:15px;font-weight:700;color:#333;">Datos del servicio</div></td></tr>'+
      '<tr><td style="padding:0 18px;"><table role="presentation" width="100%" style="border:1px solid #E9EEF0;border-radius:8px;overflow:hidden;">'+
        row('Folio de orden', o.folio)+
        row('Folio de autorización', o.folioAutorizacion)+
        row('Titular', o.titular)+
        row('Paciente / beneficiario', o.paciente)+
        row('Parentesco con el titular', o.parentesco||'Titular')+
        row('CURP', o.curp)+
        row('Certificado / N.° afiliación', o.certificado)+
        row('Tipo de trámite', o.tipoTramite)+
        row('Cirugía / servicio', o.servicio)+
        row('Hospital / lugar', o.hospital)+
        row('Fecha del procedimiento', o.fechaProc)+
        row('Fecha de pago programada', o.fechaPago)+
        row('Programa', o.programa)+
        row('Reserva autorizada', money(parseMoney(o.reserva)))+
      '</table></td></tr>'+
      '<tr><td style="padding:14px 18px 6px;"><div style="font-size:15px;font-weight:700;color:#333;">Instrucción de pago a proveedores</div></td></tr>'+
      '<tr><td style="padding:0 18px;"><table role="presentation" width="100%" style="border:1px solid #E9EEF0;border-radius:8px;overflow:hidden;">'+recBlocks+
        '<tr><td style="padding:9px 10px;text-align:right;font-weight:800;background:#FFF3EA;">TOTAL A PAGAR</td><td style="padding:9px 10px;font-weight:900;background:#FFF3EA;">'+money(total)+'</td></tr>'+
      '</table></td></tr>'+
      '<tr><td style="padding:14px 18px 18px;color:#767676;font-size:11px;">Solicitado por '+esc(o.solicitadoPor||'')+' · '+esc(new Date().toLocaleString('es-MX'))+'. MULTICATERIN, S.A. de C.V. — pago a proveedores del programa PASEM.</td></tr>'+
    '</table></td></tr></table></body></html>';
}

export const handler = async (event) => {
  const headers={'Content-Type':'application/json'};
  const p=verify((event.headers.authorization||event.headers.Authorization||'').replace('Bearer ',''));
  if(!p) return {statusCode:401,headers,body:JSON.stringify({error:'No autorizado'})};
  const isAdmin=p.role==='administracion'; const canUse=isAdmin||p.role==='operacion';
  if(!canUse) return {statusCode:403,headers,body:JSON.stringify({error:'Sin rol asignado'})};
  const store=makeStore('pasem-ordenes');
  try{
    if(event.httpMethod==='GET'){
      const {blobs}=await store.list({prefix:'orden:'});
      let items=(await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})))).filter(Boolean);
      items.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      return {statusCode:200,headers,body:JSON.stringify(items)};
    }
    if(event.httpMethod==='POST'){
      const data=JSON.parse(event.body||'{}');

      if(data.action==='delete'){
        if(!isAdmin) return {statusCode:403,headers,body:JSON.stringify({error:'Solo administración puede eliminar'})};
        if(!data.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
        await store.delete('orden:'+data.id);
        return {statusCode:200,headers,body:JSON.stringify({ok:true})};
      }

      if(data.action==='solicitar'){
        if(!data.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
        const o=await store.get('orden:'+data.id,{type:'json'}); if(!o) return {statusCode:404,headers,body:JSON.stringify({error:'Orden no encontrada'})};
        const key=process.env.RESEND_API_KEY; if(!key) return {statusCode:500,headers,body:JSON.stringify({error:'Falta RESEND_API_KEY'})};
        const from=process.env.PAGO_FROM||process.env.MAIL_FROM||'PASEM <asistenciaseccion26@pasem.com>';
        const to=(process.env.PAGO_TO||'gustavocabrera@bidaseguros.org,gcocampo@bidaseguros.org,gloriavergara@bidaseguros.org,rodrigoperez@bidaseguros.org').split(',').map(s=>s.trim()).filter(Boolean);
        o.solicitadoPor=p.email||'usuario';
        const total=(o.receptores||[]).filter(r=>parseMoney(r.monto)>0).reduce((a,r)=>a+parseMoney(r.monto),0);
        // Adjuntos: factura de la orden + CSF y estado de cuenta de cada proveedor receptor
        const attachments=[]; const faltantes=[]; let totalB64=0;
        const push=(doc, etiqueta)=>{ if(!doc){ if(etiqueta) faltantes.push(etiqueta); return; } totalB64+=doc.content.length; if(totalB64<=26_000_000) attachments.push({ filename: doc.filename, content: doc.content }); else faltantes.push(etiqueta+' (excede el límite de tamaño del correo)'); };
        const provStore=makeStore('pasem-proveedores'); const vistos={};
        for(const r of (o.receptores||[])){
          const etq=(r.nombre||r.tipo||'receptor');
          // factura y XML de ESTE receptor
          if(r.facturaDoc&&r.facturaDoc.docId) push(await readDoc('pasem-orden-docs', r.facturaDoc.docId), 'Factura de '+etq);
          else faltantes.push('Factura de '+etq);
          if(r.xmlDoc&&r.xmlDoc.docId) push(await readDoc('pasem-orden-docs', r.xmlDoc.docId), 'XML de '+etq);
          else faltantes.push('XML de '+etq);
          // expediente del proveedor (CSF + estado de cuenta), sin duplicar el mismo proveedor
          if(r.provId && !vistos[r.provId]){ vistos[r.provId]=1;
            const pv=await provStore.get('prov:'+r.provId,{type:'json'});
            if(pv){
              if(pv.csfDoc&&pv.csfDoc.docId) push(await readDoc('pasem-prov-docs', pv.csfDoc.docId), 'CSF de '+(pv.nombre||''));
              else faltantes.push('CSF de '+(pv.nombre||''));
              if(pv.edoCuentaDoc&&pv.edoCuentaDoc.docId) push(await readDoc('pasem-prov-docs', pv.edoCuentaDoc.docId), 'Estado de cuenta de '+(pv.nombre||''));
              else faltantes.push('Estado de cuenta de '+(pv.nombre||''));
            }
          }
        }
        let htmlFull=correoHtml(o);
        if(faltantes.length){ htmlFull=htmlFull.replace('</body>', '<div style="max-width:680px;margin:0 auto 18px;padding:10px 14px;background:#FFF7E6;border:1px solid #f0d08a;border-radius:8px;font-family:Arial;color:#7a5b00;font-size:12px;">Documentos no adjuntados (verificar en el expediente del proveedor): '+faltantes.map(esc).join('; ')+'.</div></body>'); }
        const payload={ from, to, subject:'PASEM — Solicitud de Orden de Pago '+(o.folio||'')+' · '+(o.paciente||'')+' · '+money(total), html: htmlFull, attachments: attachments.length?attachments:undefined };
        const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const rd=await r.json().catch(()=>({}));
        if(!r.ok) return {statusCode:502,headers,body:JSON.stringify({error:(rd&&(rd.message||rd.name))||('Resend '+r.status)})};
        o.solicitadoAt=new Date().toISOString(); o.solicitadoPor=p.email||'usuario'; o.estado='solicitada';
        await store.setJSON('orden:'+o.id,o);
        return {statusCode:200,headers,body:JSON.stringify({ok:true, to, emailId:rd.id})};
      }

      // marcar como PAGADA
      if(data.action==='pagar'){
        if(!data.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
        const o=await store.get('orden:'+data.id,{type:'json'}); if(!o) return {statusCode:404,headers,body:JSON.stringify({error:'Orden no encontrada'})};
        o.estado='pagada'; o.pagadaAt=new Date().toISOString(); o.pagadaPor=p.email||'usuario'; if(data.fechaPago) o.fechaPago=data.fechaPago;
        await store.setJSON('orden:'+o.id,o);
        return {statusCode:200,headers,body:JSON.stringify(o)};
      }

      // crear o actualizar: validar reserva (bloqueante)
      const err=validar(data);
      if(err) return {statusCode:400,headers,body:JSON.stringify({error:err})};

      // A1: la suma de ESTA orden + lo ya comprometido en OTRAS órdenes del mismo caso no debe superar la reserva
      {
        const reserva=parseMoney(data.reserva);
        const autId=data.autId||''; const folioAut=norm(data.folioAutorizacion||'');
        const sumaEsta=(data.receptores||[]).reduce((a,r)=>a+parseMoney(r.monto),0);
        const { blobs }=await store.list({prefix:'orden:'});
        const todas=(await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})))).filter(Boolean);
        let comprometido=0;
        todas.forEach(o=>{ if(data.id && o.id===data.id) return; // excluir la que se edita
          const mismo = (autId && o.autId===autId) || (folioAut && norm(o.folioAutorizacion)===folioAut);
          if(mismo) comprometido += (o.receptores||[]).reduce((a,r)=>a+parseMoney(r.monto),0);
        });
        if(comprometido + sumaEsta > reserva + 0.001){
          const disp=reserva-comprometido;
          return {statusCode:400,headers,body:JSON.stringify({error:'El caso ya tiene '+money(comprometido)+' comprometido en otras órdenes. Disponible de la reserva: '+money(disp>0?disp:0)+' (reserva '+money(reserva)+'). Esta orden suma '+money(sumaEsta)+'.'})};
        }
      }

      if(data.action==='update'){
        if(!data.id) return {statusCode:400,headers,body:JSON.stringify({error:'Falta id'})};
        const rec=await store.get('orden:'+data.id,{type:'json'}); if(!rec) return {statusCode:404,headers,body:JSON.stringify({error:'Orden no encontrada'})};
        const patch={...data}; delete patch.action;
        const merged={...rec, ...patch, id:rec.id, folio:rec.folio, createdAt:rec.createdAt, editadoPor:p.email||'usuario', editadoAt:new Date().toISOString()};
        await store.setJSON('orden:'+rec.id, merged);
        return {statusCode:200,headers,body:JSON.stringify(merged)};
      }

      // crear
      const id=crypto.randomUUID();
      const folio='OP-'+Date.now().toString(36).toUpperCase().slice(-6);
      const rec={...data, id, folio, createdAt:new Date().toISOString(), capturadoPor:p.email||'usuario'};
      delete rec.action; delete rec.estado; delete rec.pagadaAt; delete rec.pagadaPor; delete rec.solicitadoAt; rec.estado='registrada';
      await store.setJSON('orden:'+id, rec);
      return {statusCode:200,headers,body:JSON.stringify(rec)};
    }
    return {statusCode:405,headers,body:JSON.stringify({error:'Método no permitido'})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({error:String(e&&e.message?e.message:e)})}; }
};
