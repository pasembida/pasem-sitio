import crypto from 'node:crypto';
import BASE_RAW from './lib/beneficiarios.json';
import { getStore } from '@netlify/blobs';
import { schedule } from '@netlify/functions';
const BASE = Array.isArray(BASE_RAW) ? BASE_RAW : [];

function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }

const norm=s=>String(s==null?'':s).trim().toUpperCase();
const dayOf=iso=>{ try{ return new Date(iso).toISOString().slice(0,10); }catch(e){ return ''; } };
const ETAPAS={'1':'Solicitud de atención','2':'Solicitud de documentación','3':'Autorización generada','4':'Servicio otorgado'};
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function fmtFecha(iso){ try{ return new Date(iso).toLocaleString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(e){ return iso||''; } }
function diasTxt(d){ if(d==null) return '—'; if(d===0) return 'Hoy'; return d+(d===1?' día':' días'); }

function informeEmailHtml(d){
  const base=(process.env.SITE_URL||'https://pasem.com').replace(/\/$/,'');
  const snte=base+'/img/snte26.jpg', bida=base+'/img/bida.png';
  const t=d.totals||{};
  const bar=(txt)=>'<tr><td colspan="6" style="background:#DD6B20;color:#fff;font-weight:700;font-size:13px;padding:8px 10px;">'+esc(txt)+'</td></tr>';
  function tbl(headers, rows){ return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;margin:6px 0 14px;"><thead><tr>'+headers.map(h=>'<th style="border:1px solid #E2E8EA;background:#FFF3EA;padding:6px 8px;text-align:left;">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>'; }
  const kpi=(l,v)=>'<td style="border:1px solid #E2E8EA;border-radius:8px;padding:8px 10px;"><div style="font-size:10px;text-transform:uppercase;color:#767676;font-weight:700;">'+esc(l)+'</div><div style="font-size:20px;font-weight:900;color:#1f3442;">'+esc(v)+'</div></td>';
  const diaRows=(d.diario||[]).map(r=>'<tr><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+esc(r.fecha)+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+r.altas+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+r.titulares+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+r.dependientes+'</td></tr>').join('')||'<tr><td colspan="4" style="border:1px solid #E2E8EA;padding:6px 8px;">Sin datos.</td></tr>';
  const nvRows=(d.nuevos||[]).map(r=>'<tr><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+esc(r.curp)+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+esc(r.nombre||'—')+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+esc(r.contacto||'—')+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+esc(r.telefono||'—')+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+esc(fmtFecha(r.fecha))+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+(r.docs||0)+'</td></tr>').join('')||'<tr><td colspan="6" style="border:1px solid #E2E8EA;padding:6px 8px;">Todos los titulares que actualizaron ya están en el padrón.</td></tr>';
  const money=n=>'$'+Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
  const prList=(d.procedimientos||[]);
  const pagoBadge=s=> s.pagoSolicitado ? '<span style="background:#E8F8EE;color:#1e7e3e;border:1px solid #bfe6cc;border-radius:999px;padding:1px 7px;font-size:11px;font-weight:700;">Pago solicitado</span>' : '<span style="color:#9aa;">—</span>';
  const prRows=prList.map(s=>{ const col=(s.diasEnEtapa>=15?'color:#b23b3b;font-weight:800;':(s.diasEnEtapa>=7?'color:#b9770e;font-weight:700;':'')); const hl=s.pagoSolicitado?'background:#F3FBF5;':''; return '<tr><td style="border:1px solid #E2E8EA;padding:6px 8px;'+hl+'">'+esc(s.folio||'—')+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;'+hl+'">'+esc(s.nombre||'—')+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;'+hl+'"><strong>'+esc(s.tipoTramite||'—')+'</strong></td><td style="border:1px solid #E2E8EA;padding:6px 8px;'+hl+'">'+esc(s.etapa+'. '+s.etapaLabel)+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;'+col+hl+'">'+esc(diasTxt(s.diasEnEtapa))+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;text-align:right;'+hl+'">'+(s.reservaNum?money(s.reservaNum):'—')+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;text-align:center;'+hl+'">'+pagoBadge(s)+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;'+hl+'">'+esc(s.comentarios||'—')+'</td></tr>'; }).join('');
  const prTotal = prList.length ? ('<tr><td colspan="5" style="border:1px solid #E2E8EA;padding:6px 8px;text-align:right;font-weight:700;background:#FFF3EA;">Total de Presupuesto de Reserva</td><td style="border:1px solid #E2E8EA;padding:6px 8px;text-align:right;font-weight:800;background:#FFF3EA;">'+money(d.reservaTotal||0)+'</td><td colspan="2" style="border:1px solid #E2E8EA;background:#FFF3EA;"></td></tr>') : '';
  const prBody = (prRows||'<tr><td colspan="8" style="border:1px solid #E2E8EA;padding:6px 8px;">No hay procedimientos abiertos.</td></tr>') + prTotal;
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#EAF6F6;font-family:Arial,Helvetica,sans-serif;color:#1f3442;">'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF6F6;padding:16px 10px;"><tr><td align="center">'+
    '<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#fff;border:1px solid #D9E9E9;border-radius:12px;overflow:hidden;">'+
      '<tr><td style="padding:14px 18px;"><table role="presentation" width="100%"><tr><td align="left"><img src="'+snte+'" height="46" style="height:46px;"></td><td align="center" style="font-size:12px;color:#767676;">Programa de Apoyo de Servicios Médicos<br><span style="font-size:20px;font-weight:900;color:#DD6B20;">PASEM</span></td><td align="right"><img src="'+bida+'" height="46" style="height:46px;"></td></tr></table></td></tr>'+
      '<tr><td style="height:4px;background:#14B4B6;font-size:0;line-height:0;">&nbsp;</td></tr>'+
      '<tr><td style="padding:16px 18px 2px;"><div style="font-size:18px;font-weight:800;">Informe a la Dirección General</div><div style="color:#767676;font-size:12px;">Generado: '+esc(fmtFecha(d.generatedAt))+'</div></td></tr>'+
      '<tr><td style="padding:8px 18px;">'+
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'+
        bar('1. Padrón')+
        '<tr><td colspan="6" style="padding:6px 2px 2px;font-size:14px;">Titulares en el padrón: <strong>'+Number(d.padronTotal||0).toLocaleString('es-MX')+'</strong></td></tr>'+
        '<tr><td colspan="6" style="padding:2px 2px;font-size:14px;">Dependientes dados de alta: <strong>'+Number(d.dependientesPadron||0).toLocaleString('es-MX')+'</strong></td></tr>'+
        '<tr><td colspan="6" style="padding:4px 2px 10px;font-size:14px;border-top:1px solid #E9EEF0;">Total de personas (titulares + dependientes): <strong style="color:#DD6B20;">'+Number(d.padronPersonas||((d.padronTotal||0)+(d.dependientesPadron||0))).toLocaleString('es-MX')+'</strong></td></tr>'+
        bar('2. Actualizaciones de datos recibidas')+
        '<tr><td colspan="6" style="padding:6px 0 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>'+kpi('Altas',Number(t.altas||0).toLocaleString('es-MX'))+kpi('Titulares únicos',Number(t.titularesUnicos||0).toLocaleString('es-MX'))+kpi('Dependientes',Number(t.dependientes||0).toLocaleString('es-MX'))+kpi('Ya en padrón',Number(t.titularesEnPadron||0).toLocaleString('es-MX'))+kpi('Nuevos',Number(t.titularesNuevos||0).toLocaleString('es-MX'))+'</tr></table></td></tr>'+
        bar('3. Acumulado diario')+
        '<tr><td colspan="6">'+tbl(['Fecha','Altas','Titulares','Dependientes'], diaRows)+'</td></tr>'+
        bar('4. Titulares nuevos para inclusión ('+(d.nuevos||[]).length+')')+
        '<tr><td colspan="6">'+tbl(['CURP','Nombre','Contacto','Teléfono','Fecha','Docs'], nvRows)+'</td></tr>'+
        bar('5. Procedimientos abiertos ('+(d.procedimientos||[]).length+')')+
        '<tr><td colspan="6">'+tbl(['Folio','Nombre','Trámite solicitado','Etapa actual','Tiempo en etapa','Reserva','Pago','Detalle'], prBody)+'</td></tr>'+
        '</table>'+
      '</td></tr>'+
      '<tr><td style="padding:10px 18px 18px;color:#767676;font-size:11px;">PASEM · Sección 26 del SNTE · Administrado por MULTICATERIN, S.A. de C.V. con respaldo de BIDA Seguros.</td></tr>'+
    '</table></td></tr></table></body></html>';
}

async function computeInforme(){
    // Padrón base (CURP de titulares)
    const padronCurps=new Set(); let padronTotal=0;
    (BASE||[]).forEach(x=>{ padronTotal++; const c=norm(x.c||x.curp); if(c) padronCurps.add(c); });

    // Altas enviadas por el formulario público
    const rs=makeStore('pasem-altas');
    let altas=[]; try{ const {blobs}=await rs.list({prefix:'alta:'}); altas=(await Promise.all(blobs.map(b=>rs.get(b.key,{type:'json'})))).filter(Boolean); }catch(e){ altas=[]; }

    const tCurpVistos=new Set();      // titulares únicos por CURP
    const nuevosMap=new Map();        // titulares no encontrados en padrón
    const enPadronSet=new Set();      // titulares que sí están en padrón
    const diario={};                  // por día: {altas, titulares, dependientes}
    let totalDependientes=0, totalTitulares=0;

    function depCount(f){
      let n=0;
      if(norm(f['Cónyuge - CURP'])||norm(f['Cónyuge - Nombres'])||norm(f['Cónyuge - Primer apellido'])) n++;
      for(let i=1;i<=4;i++){ if(norm(f['Hijo '+i+' - Nombre'])||norm(f['Hijo '+i+' - CURP'])) n++; }
      for(let j=1;j<=2;j++){ if(norm(f['Padre '+j+' - Nombre'])||norm(f['Padre '+j+' - CURP'])) n++; }
      return n;
    }

    altas.forEach(a=>{
      const f=a.fields||{}; const d=dayOf(a.createdAt)||'sin-fecha';
      diario[d]=diario[d]||{altas:0,titulares:0,dependientes:0};
      diario[d].altas++;
      const tc=norm(f['Titular - CURP']);
      const tnom=[f['Titular - Primer apellido'],f['Titular - Segundo apellido'],f['Titular - Nombres']].filter(Boolean).join(' ').trim();
      if(tc || tnom){
        totalTitulares++;
        diario[d].titulares++;
        if(tc && !tCurpVistos.has(tc)){
          tCurpVistos.add(tc);
          if(padronCurps.has(tc)){ enPadronSet.add(tc); }
          else if(!nuevosMap.has(tc)){
            nuevosMap.set(tc, { curp:tc, nombre:tnom, contacto:f['Contacto - Nombre']||'', telefono:f['Contacto - Telefono']||'', correo:f['Contacto - Correo']||'', fecha:a.createdAt, altaId:a.id, docs:(a.docs||[]).length });
          }
        }
      }
      const dep=depCount(f);
      totalDependientes+=dep; diario[d].dependientes+=dep;
    });

    const diarioArr=Object.keys(diario).sort().map(k=>({fecha:k, ...diario[k]}));
    const nuevos=Array.from(nuevosMap.values()).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));

    // Dependientes dados de alta en el padrón: de las altas en línea + del módulo de administración, sin duplicar por CURP.
    const depCurps=new Set(); let depSinCurp=0;
    altas.forEach(a=>{ const f=a.fields||{};
      const add=(c)=>{ const k=norm(c); if(k) depCurps.add(k); else depSinCurp++; };
      if(norm(f['Cónyuge - CURP'])||norm(f['Cónyuge - Nombres'])||norm(f['Cónyuge - Primer apellido'])) add(f['Cónyuge - CURP']);
      for(let i=1;i<=4;i++){ if(norm(f['Hijo '+i+' - Nombre'])||norm(f['Hijo '+i+' - CURP'])) add(f['Hijo '+i+' - CURP']); }
      for(let j=1;j<=2;j++){ if(norm(f['Padre '+j+' - Nombre'])||norm(f['Padre '+j+' - CURP'])) add(f['Padre '+j+' - CURP']); }
    });
    // Dependientes registrados desde el módulo de administración (pasem-dependientes)
    try{
      const ds2=makeStore('pasem-dependientes');
      const {blobs}=await ds2.list();
      const deps=(await Promise.all(blobs.map(b=>ds2.get(b.key,{type:'json'})))).filter(Boolean);
      deps.forEach(x=>{ const k=norm(x.curp); if(k) depCurps.add(k); else depSinCurp++; });
    }catch(e){}
    const dependientesPadron = depCurps.size + depSinCurp;

    // Procedimientos abiertos (solicitudes con estado < 4)
    const ss=makeStore('pasem-solicitudes');
    let sols=[]; try{ const {blobs}=await ss.list(); sols=(await Promise.all(blobs.map(b=>ss.get(b.key,{type:'json'})))).filter(Boolean); }catch(e){ sols=[]; }
    const now=Date.now();
    const parseMoney=v=>{ const n=Number(String(v==null?'':v).replace(/[^0-9.]/g,'')); return isFinite(n)?n:0; };

    // Órdenes de pago YA solicitadas (correo enviado), ligadas por folio de autorización / solicitud
    const foliosPagoSolicitado=new Set();
    try{
      const os=makeStore('pasem-ordenes');
      const { blobs }=await os.list({prefix:'orden:'});
      const ordenes=(await Promise.all(blobs.map(b=>os.get(b.key,{type:'json'})))).filter(Boolean);
      ordenes.forEach(o=>{ if(o.estado==='solicitada'){ const f=norm(o.folioAutorizacion); if(f) foliosPagoSolicitado.add(f); } });
    }catch(e){}

    let reservaTotal=0;
    const solById={}; sols.forEach(s=>{ if(s&&s.id) solById[s.id]=s; });
    const procedimientos=sols.filter(s=>Number(s.estado||1)<4).map(s=>{
      const et=s.etapas||{}; let maxEt='1'; Object.keys(et).forEach(k=>{ if(['1','2','3','4'].indexOf(k)>=0 && Number(k)>Number(maxEt)) maxEt=k; });
      const desde=et[maxEt]||s.updatedAt||s.createdAt;
      const dias=desde?Math.floor((now-new Date(desde).getTime())/86400000):null;
      const reservaNum=parseMoney(s.reserva); reservaTotal+=reservaNum;
      return {
        folio:s.folio||'', folioEleonor:s.folioEleonor||'', nombre:s.nombre||'', certificado:s.certificado||'',
        tipoTramite:s.tipoTramite||'', comentarios:s.comentarios||'',
        reserva:s.reserva||'', reservaNum:reservaNum,
        pagoSolicitado: foliosPagoSolicitado.has(norm(s.folio)),
        etapa:maxEt, etapaLabel:ETAPAS[maxEt]||maxEt, desde:desde||'', diasEnEtapa:dias,
        createdAt:s.createdAt||''
      };
    });

    // También incluir AUTORIZACIONES (atenciones) que no tengan una solicitud abierta con el mismo folio,
    // para no perder casos ya autorizados (p. ej. registrados directo en Autorización o con solicitud cerrada).
    const foliosProc=new Set(procedimientos.map(x=>norm(x.folio)));
    try{
      const as=makeStore('pasem-atenciones');
      const { blobs }=await as.list();
      const atns=(await Promise.all(blobs.map(b=>as.get(b.key,{type:'json'})))).filter(Boolean);
      atns.forEach(a=>{
        const f=norm(a.folio); if(!f || foliosProc.has(f)) return;
        foliosProc.add(f);
        // reserva: la de la atención o, si no, la de su solicitud de origen
        let reservaStr=a.reserva||''; if(!(parseMoney(reservaStr)>0) && a.solicitudId && solById[a.solicitudId]) reservaStr=solById[a.solicitudId].reserva||'';
        const reservaNum=parseMoney(reservaStr); reservaTotal+=reservaNum;
        const desde=a.fechaAutorizacion||a.editadoAt||a.createdAt;
        const dias=desde?Math.floor((now-new Date(desde).getTime())/86400000):null;
        procedimientos.push({
          folio:a.folio||'', folioEleonor:a.folioEleonor||'', nombre:a.paciente||'', certificado:a.numAfiliado||a.certificado||'',
          tipoTramite:a.tipoTramite||'', comentarios:a.observaciones||'',
          reserva:reservaStr||'', reservaNum:reservaNum,
          pagoSolicitado: foliosPagoSolicitado.has(f),
          etapa:'3', etapaLabel:ETAPAS['3'], desde:desde||'', diasEnEtapa:dias,
          createdAt:a.createdAt||''
        });
      });
    }catch(e){}

    procedimientos.sort((a,b)=>(b.diasEnEtapa||0)-(a.diasEnEtapa||0));

    return {
      generatedAt:new Date().toISOString(),
      padronTotal,
      dependientesPadron,
      padronPersonas: padronTotal + dependientesPadron,
      totals:{ altas:altas.length, titularesUnicos:tCurpVistos.size, titularesConDatos:totalTitulares, dependientes:totalDependientes, titularesEnPadron:enPadronSet.size, titularesNuevos:nuevos.length },
      diario:diarioArr,
      nuevos,
      procedimientos,
      reservaTotal
    };
  }
}

const run = async () => {
  try{
    const key=process.env.RESEND_API_KEY;
    if(!key){ console.log('informe-cron: falta RESEND_API_KEY'); return {statusCode:200}; }
    const data=await computeInforme();
    const from=process.env.INFORME_FROM||process.env.MAIL_FROM||'PASEM <asistenciaseccion26@pasem.com>';
    const to=process.env.INFORME_TO||'bidaseguros@bidaseguros.org';
    const t=data.totals||{};
    const payload={ from, to:[to], subject:'PASEM — Informe diario a la Dirección General ('+dayOf(data.generatedAt)+')', html: informeEmailHtml(data), text:'Informe PASEM — Generado '+fmtFecha(data.generatedAt)+'. Padrón '+data.padronTotal+', dependientes '+data.dependientesPadron+', total '+data.padronPersonas+'. Procedimientos abiertos '+(data.procedimientos||[]).length+'.' };
    const r=await fetch('https://api.resend.com/emails',{ method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
    const rd=await r.json().catch(()=>({}));
    if(!r.ok){ console.log('informe-cron: error Resend', r.status, rd && (rd.message||rd.name)); } else { console.log('informe-cron: enviado a', to, 'id', rd.id); }
  }catch(e){ console.log('informe-cron: excepción', String(e&&e.message?e.message:e)); }
  return {statusCode:200};
};
export const handler = schedule('0 15 * * *', run);
