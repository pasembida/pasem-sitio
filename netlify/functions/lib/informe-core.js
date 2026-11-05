import crypto from 'node:crypto';
import BASE_RAW from './beneficiarios.json';
import { getStore } from '@netlify/blobs';
const BASE = Array.isArray(BASE_RAW) ? BASE_RAW : [];
function makeStore(name){ const siteID=process.env.NETLIFY_SITE_ID||process.env.SITE_ID; const token=process.env.NETLIFY_API_TOKEN||process.env.NETLIFY_AUTH_TOKEN; if(siteID&&token) return getStore({name,siteID,token}); return getStore(name); }

const norm=s=>String(s==null?'':s).trim().toUpperCase();
const dayOf=iso=>{ try{ return new Date(iso).toISOString().slice(0,10); }catch(e){ return ''; } };
const ETAPAS_SETS={
  _def:{'1':'Solicitud de atención','2':'Solicitud de documentación','3':'Autorización generada','4':'Servicio otorgado'},
  esp:{'1':'Solicitud de servicio','2':'Autorización/coordinación con médico','3':'Cita programada (en espera de atención)','4':'Servicio otorgado'},
  est:{'1':'Solicitud de servicio','2':'Autorización','3':'Cita programada','4':'Servicio otorgado'}
};
function setEtapas(t){ t=String(t||'').toUpperCase(); if(t.indexOf('CONSULTA')>=0) return ETAPAS_SETS.esp; if(t.indexOf('ESTUDIO')>=0||t.indexOf('LABORATORIO')>=0) return ETAPAS_SETS.est; return ETAPAS_SETS._def; }
function etiquetaEtapa(t,et){ return setEtapas(t)[String(et)]||String(et); }
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
  const abiertos=prList.filter(s=>!s.pagado), cerrados=prList.filter(s=>s.pagado);
  const sumReserva=arr=>arr.reduce((a,s)=>a+(s.reservaNum||0),0);
  const fila=s=>{ const col=(s.diasEnEtapa>=15?'color:#b23b3b;font-weight:800;':(s.diasEnEtapa>=7?'color:#b9770e;font-weight:700;':'')); return '<tr><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+esc(s.folio||'—')+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+esc(s.nombre||'—')+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;"><strong>'+esc(s.tipoTramite||'—')+'</strong></td><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+esc(s.etapa+'. '+s.etapaLabel)+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;'+col+'">'+esc(diasTxt(s.diasEnEtapa))+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;text-align:right;">'+(s.reservaNum?money(s.reservaNum):'—')+'</td><td style="border:1px solid #E2E8EA;padding:6px 8px;">'+esc(s.comentarios||'—')+'</td></tr>'; };
  const tabla=(arr,vacio)=>{ const rows=arr.map(fila).join('')||('<tr><td colspan="7" style="border:1px solid #E2E8EA;padding:6px 8px;">'+vacio+'</td></tr>'); const tot=arr.length?('<tr><td colspan="5" style="border:1px solid #E2E8EA;padding:6px 8px;text-align:right;font-weight:700;background:#FFF3EA;">Total de Reserva</td><td style="border:1px solid #E2E8EA;padding:6px 8px;text-align:right;font-weight:800;background:#FFF3EA;">'+money(sumReserva(arr))+'</td><td style="border:1px solid #E2E8EA;background:#FFF3EA;"></td></tr>'):''; return tbl(['Folio','Paciente (titular)','Trámite solicitado','Etapa actual','Tiempo en etapa','Reserva','Detalle'], rows+tot); };
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
        bar('5. Procedimientos ABIERTOS ('+abiertos.length+')')+
        '<tr><td colspan="6">'+tabla(abiertos,'No hay procedimientos abiertos.')+'</td></tr>'+
        bar('6. Procedimientos CERRADOS — pagados ('+cerrados.length+')')+
        '<tr><td colspan="6">'+tabla(cerrados,'No hay procedimientos pagados.')+'</td></tr>'+
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
    let dependientesRegistrados=0;
    try{
      const ds2=makeStore('pasem-dependientes');
      const {blobs}=await ds2.list();
      const deps=(await Promise.all(blobs.map(b=>ds2.get(b.key,{type:'json'})))).filter(Boolean);
      dependientesRegistrados=deps.length;
      deps.forEach(x=>{ const k=norm(x.curp); if(k) depCurps.add(k); else depSinCurp++; });
    }catch(e){}
    const dependientesPadron = depCurps.size + depSinCurp;
    // Titulares nuevos dados de alta (pasem-titulares)
    let titularesNuevosAlta=0;
    try{ const ts2=makeStore('pasem-titulares'); const {blobs:tb2}=await ts2.list(); titularesNuevosAlta=tb2.length; }catch(e){}
    // Configuración (cuota pendiente del contrato)
    let cuota=3123000, contrato='PASEM SNTE 26', periodo='Oct-Nov-Dic 2026';
    try{ const cs=makeStore('pasem-config'); const cfg=await cs.get('config',{type:'json'}); if(cfg){ if(cfg.cuota!=null) cuota=Number(cfg.cuota); if(cfg.contrato) contrato=cfg.contrato; if(cfg.periodo!=null) periodo=cfg.periodo; } }catch(e){}

    // Procedimientos abiertos (solicitudes con estado < 4)
    const ss=makeStore('pasem-solicitudes');
    let sols=[]; try{ const {blobs}=await ss.list(); sols=(await Promise.all(blobs.map(b=>ss.get(b.key,{type:'json'})))).filter(Boolean); }catch(e){ sols=[]; }
    const now=Date.now();
    const parseMoney=v=>{ const n=Number(String(v==null?'':v).replace(/[^0-9.]/g,'')); return isFinite(n)?n:0; };

    // Órdenes de pago YA solicitadas (correo enviado), ligadas por folio de autorización / solicitud
    const foliosPagoSolicitado=new Set();
    const foliosPagados=new Set();
    try{
      const os=makeStore('pasem-ordenes');
      const { blobs }=await os.list({prefix:'orden:'});
      const ordenes=(await Promise.all(blobs.map(b=>os.get(b.key,{type:'json'})))).filter(Boolean);
      ordenes.forEach(o=>{ const f=norm(o.folioAutorizacion); if(!f) return; if(o.estado==='solicitada'||o.estado==='pagada') foliosPagoSolicitado.add(f); if(o.estado==='pagada') foliosPagados.add(f); });
    }catch(e){}

    let reservaTotal=0;
    const solById={}; sols.forEach(s=>{ if(s&&s.id) solById[s.id]=s; });
    const procedimientos=sols.filter(s=>Number(s.estado||1)<4).map(s=>{
      const et=s.etapas||{}; let maxEt='1'; Object.keys(et).forEach(k=>{ if(['1','2','3','4'].indexOf(k)>=0 && Number(k)>Number(maxEt)) maxEt=k; });
      const desde=et[maxEt]||s.updatedAt||s.createdAt;
      const dias=desde?Math.floor((now-new Date(desde).getTime())/86400000):null;
      const reservaNum=parseMoney(s.reserva); reservaTotal+=reservaNum;
      return {
        folio:s.folio||'', folioEleonor:s.folioEleonor||'', nombre:(s.beneficiarioNombre && norm(s.beneficiarioNombre)!==norm(s.nombre) ? (s.beneficiarioNombre+' ('+(s.beneficiarioParentesco||'benef.')+' de '+(s.nombre||'')+')') : (s.nombre||'')), beneficiario:s.beneficiarioNombre||s.nombre||'', titular:s.nombre||'', certificado:s.certificado||'',
        tipoTramite:s.tipoTramite||'', comentarios:s.comentarios||'',
        reserva:s.reserva||'', reservaNum:reservaNum,
        pagoSolicitado: foliosPagoSolicitado.has(norm(s.folio)), pagado: foliosPagados.has(norm(s.folio)),
        etapa:maxEt, etapaLabel:etiquetaEtapa(s.tipoTramite,maxEt), desde:desde||'', diasEnEtapa:dias,
        createdAt:s.createdAt||''
      };
    });

    // También incluir AUTORIZACIONES (atenciones) que no tengan una solicitud abierta con el mismo folio,
    // para no perder casos ya autorizados (p. ej. registrados directo en Autorización o con solicitud cerrada).
    const foliosProc=new Set(procedimientos.map(x=>norm(x.folio)));
    const foliosCancelados=new Set(sols.filter(s=>s.cancelada||Number(s.estado)===9).map(s=>norm(s.folio)));
    // El cierre del caso en el informe depende ÚNICAMENTE de si su orden está PAGADA (no del botón Finalizar).
    try{
      const as=makeStore('pasem-atenciones');
      const { blobs }=await as.list();
      const atns=(await Promise.all(blobs.map(b=>as.get(b.key,{type:'json'})))).filter(Boolean);
      atns.forEach(a=>{
        const f=norm(a.folio); if(!f || foliosProc.has(f) || foliosCancelados.has(f)) return;
        foliosProc.add(f);
        // reserva: la de la atención o, si no, la de su solicitud de origen
        let reservaStr=a.reserva||''; if(!(parseMoney(reservaStr)>0) && a.solicitudId && solById[a.solicitudId]) reservaStr=solById[a.solicitudId].reserva||'';
        const reservaNum=parseMoney(reservaStr); reservaTotal+=reservaNum;
        const desde=a.fechaAutorizacion||a.editadoAt||a.createdAt;
        const dias=desde?Math.floor((now-new Date(desde).getTime())/86400000):null;
        procedimientos.push({
          folio:a.folio||'', folioEleonor:a.folioEleonor||'', nombre:(a.titular && norm(a.titular)!==norm(a.paciente) ? (a.paciente+' ('+(a.parentesco||'benef.')+' de '+a.titular+')') : (a.paciente||'')), beneficiario:a.paciente||'', titular:a.titular||a.paciente||'', certificado:a.numAfiliado||a.certificado||'',
          tipoTramite:a.tipoTramite||'', comentarios:a.observaciones||'',
          reserva:reservaStr||'', reservaNum:reservaNum,
          pagoSolicitado: foliosPagoSolicitado.has(f), pagado: foliosPagados.has(f),
          etapa:'3', etapaLabel:etiquetaEtapa(a.tipoTramite,'3'), desde:desde||'', diasEnEtapa:dias,
          createdAt:a.createdAt||''
        });
      });
    }catch(e){}

    procedimientos.sort((a,b)=>(b.diasEnEtapa||0)-(a.diasEnEtapa||0));

    return {
      generatedAt:new Date().toISOString(),
      padronTotal,
      dependientesPadron,
      dependientesRegistrados,
      titularesNuevosAlta,
      cuota, contrato, periodo,
      padronActualizado: padronTotal + titularesNuevosAlta,
      padronPersonas: padronTotal + dependientesPadron,
      totals:{ altas:altas.length, titularesUnicos:tCurpVistos.size, titularesConDatos:totalTitulares, dependientes:totalDependientes, titularesEnPadron:enPadronSet.size, titularesNuevos:nuevos.length },
      diario:diarioArr,
      nuevos,
      procedimientos,
      reservaTotal
    };
  }

// ===== Reporte Dirección por correo (agregado por tipo de trámite, sin nombres) =====
function repdirEmailHtml(d){
  const base=(process.env.SITE_URL||'https://pasem.com').replace(/\/$/,'');
  const snte=base+'/img/snte26.jpg', bida=base+'/img/bida.png';
  const money=n=>'$'+Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
  const pr=d.procedimientos||[];
  const abiertos=pr.filter(s=>!s.pagado), pagadas=pr.filter(s=>s.pagado);
  const agg=arr=>{ const m={}; arr.forEach(s=>{ const t=s.tipoTramite||'(Sin tipo)'; if(!m[t]) m[t]={n:0,r:0}; m[t].n++; m[t].r+=(s.reservaNum||0); }); return Object.keys(m).sort().map(t=>({tipo:t,n:m[t].n,r:m[t].r})); };
  const sumR=arr=>arr.reduce((a,s)=>a+(s.reservaNum||0),0);
  const bar=t=>'<tr><td colspan="3" style="background:#DD6B20;color:#fff;font-weight:700;font-size:13px;padding:8px 10px;">'+esc(t)+'</td></tr>';
  const th='<tr><td style="background:#FFF3EA;font-weight:700;font-size:12px;padding:6px 10px;border:1px solid #E9EEF0;">Tipo de trámite</td><td style="background:#FFF3EA;font-weight:700;font-size:12px;padding:6px 10px;border:1px solid #E9EEF0;">Núm. de casos</td><td style="background:#FFF3EA;font-weight:700;font-size:12px;padding:6px 10px;border:1px solid #E9EEF0;text-align:right;">Suma de reservas</td></tr>';
  const tabla=(titulo,arr)=>{ const rows=agg(arr); let body=rows.map(x=>'<tr><td style="padding:6px 10px;border:1px solid #E9EEF0;font-size:13px;">'+esc(x.tipo)+'</td><td style="padding:6px 10px;border:1px solid #E9EEF0;font-size:13px;">'+x.n+'</td><td style="padding:6px 10px;border:1px solid #E9EEF0;font-size:13px;text-align:right;">'+money(x.r)+'</td></tr>').join('')||'<tr><td colspan="3" style="padding:6px 10px;border:1px solid #E9EEF0;font-size:13px;">Sin casos.</td></tr>';
    const tot='<tr><td style="padding:6px 10px;border:1px solid #E9EEF0;font-weight:800;background:#FFF7EF;">TOTAL</td><td style="padding:6px 10px;border:1px solid #E9EEF0;font-weight:800;background:#FFF7EF;">'+arr.length+'</td><td style="padding:6px 10px;border:1px solid #E9EEF0;font-weight:800;background:#FFF7EF;text-align:right;">'+money(sumR(arr))+'</td></tr>';
    return bar(titulo+' ('+arr.length+')')+th+body+tot; };
  const padBase=d.padronTotal||0, padNuevos=d.titularesNuevosAlta||0, padAct=d.padronActualizado||(padBase+padNuevos);
  const depReg=(d.dependientesRegistrados!=null?d.dependientesRegistrados:d.dependientesPadron)||0;
  const titAct=(d.totals&&d.totals.titularesEnPadron)||0;
  // Resumen de reclamaciones (tabla ejecutiva con % de la cuota)
  let emailResumen='';
  {
    const cuota=Number(d.cuota||0), contrato=d.contrato||'PASEM SNTE 26', periodo=d.periodo||'';
    const rep={n:pr.length,m:sumR(pr)}; const pagX=pr.filter(s=>s.pagado); const pagS={n:pagX.length,m:sumR(pagX)}; const recX=pr.filter(s=>!s.pagado); const recS={n:recX.length,m:sumR(recX)};
    const pct=n=> cuota>0 ? Math.round(n/cuota*100)+'%' : '—';
    const th='font-size:13px;font-weight:800;background:#EFEFEF;padding:8px 8px;border:1px solid #C9D4D8;text-align:center;';
    const td='font-size:15px;padding:9px 10px;border:1px solid #C9D4D8;';
    const bigpct='font-size:17px;font-weight:800;color:#DD6B20;';
    const row=(lbl,per,b)=>'<tr><td style="'+td+(b?'font-weight:800;':'')+'white-space:nowrap;">'+esc(lbl)+'</td><td style="'+td+'text-align:center;font-size:13px;">'+esc(per)+'</td><td style="'+td+(b?'font-weight:800;':'')+'text-align:right;white-space:nowrap;">'+money(cuota)+'</td>'+
      '<td style="'+td+'text-align:center;">'+rep.n+'</td><td style="'+td+'text-align:right;white-space:nowrap;">'+money(rep.m)+'</td><td style="'+td+bigpct+'text-align:center;'+(b?'background:#FFF27A;':'')+'">'+pct(rep.m)+'</td>'+
      '<td style="'+td+'text-align:center;">'+pagS.n+'</td><td style="'+td+'text-align:right;white-space:nowrap;">'+money(pagS.m)+'</td><td style="'+td+bigpct+'text-align:center;">'+pct(pagS.m)+'</td>'+
      '<td style="'+td+'text-align:center;">'+recS.n+'</td><td style="'+td+'text-align:right;white-space:nowrap;">'+money(recS.m)+'</td><td style="'+td+bigpct+'text-align:center;">'+pct(recS.m)+'</td></tr>';
    emailResumen='<tr><td style="padding:8px 18px 4px;"><div style="overflow-x:auto;"><table role="presentation" style="border-collapse:collapse;width:100%;min-width:760px;">'+
      bar('Resumen de reclamaciones')+
      '<tr><th style="'+th+'" rowspan="2">CONTRATO</th><th style="'+th+'" rowspan="2">PERIODO CUBIERTO</th><th style="'+th+'" rowspan="2">CUOTA PENDIENTE</th><th style="'+th+'" colspan="3">REPORTADOS</th><th style="'+th+'" colspan="3">PAGADOS</th><th style="'+th+'" colspan="3">RECLAMADOS</th></tr>'+
      '<tr><th style="'+th+'">Casos</th><th style="'+th+'">Monto</th><th style="'+th+'">%</th><th style="'+th+'">Casos</th><th style="'+th+'">Monto</th><th style="'+th+'">%</th><th style="'+th+'">Casos</th><th style="'+th+'">Monto</th><th style="'+th+'">%</th></tr>'+
      row(contrato,periodo,false)+row('SUMAS:','',true)+
    '</table></div></td></tr>';
  }
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#EAF6F6;font-family:Arial,Helvetica,sans-serif;color:#1f3442;">'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF6F6;padding:18px 10px;"><tr><td align="center">'+
    '<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#fff;border:1px solid #D9E9E9;border-radius:12px;overflow:hidden;">'+
      '<tr><td style="padding:14px 18px;"><table role="presentation" width="100%"><tr><td align="left"><img src="'+snte+'" height="44" style="height:44px;"></td><td align="center" style="font-size:12px;color:#767676;">Programa de Apoyo de Servicios Médicos<br><span style="font-size:20px;font-weight:900;color:#DD6B20;">PASEM</span></td><td align="right"><img src="'+bida+'" height="44" style="height:44px;"></td></tr></table></td></tr>'+
      '<tr><td style="background:#DD6B20;padding:12px 18px;text-align:center;color:#fff;font-size:18px;font-weight:800;">Reporte Dirección</td></tr>'+
      '<tr><td style="height:4px;background:#14B4B6;font-size:0;line-height:0;">&nbsp;</td></tr>'+
      '<tr><td style="padding:12px 18px 2px;color:#767676;font-size:12px;">Generado: '+esc(fmtFecha(d.generatedAt))+'</td></tr>'+
      emailResumen+
      '<tr><td style="padding:8px 18px 4px;"><table role="presentation" width="100%" style="border-collapse:collapse;">'+
        bar('Padrón')+
        '<tr><td colspan="3" style="padding:8px 10px;border:1px solid #E9EEF0;font-size:13px;line-height:1.8;">'+
          'Titulares del padrón: <b>'+padBase.toLocaleString('es-MX')+'</b><br>'+
          'Titulares nuevos (dados de alta): <b>'+padNuevos.toLocaleString('es-MX')+'</b><br>'+
          'Padrón actualizado (suma): <b style="color:#DD6B20;">'+padAct.toLocaleString('es-MX')+'</b><br>'+
          'Dependientes dados de alta: <b>'+depReg.toLocaleString('es-MX')+'</b><br>'+
          'Titulares que actualizaron sus datos: <b>'+titAct.toLocaleString('es-MX')+'</b>'+
        '</td></tr>'+
      '</table></td></tr>'+
      '<tr><td style="padding:4px 18px;"><table role="presentation" width="100%" style="border-collapse:collapse;">'+tabla('Total de Reclamaciones Reportadas', pr)+'</table></td></tr>'+
      '<tr><td style="padding:4px 18px;"><table role="presentation" width="100%" style="border-collapse:collapse;">'+tabla('Reclamaciones en trámite', abiertos)+'</table></td></tr>'+
      '<tr><td style="padding:4px 18px 14px;"><table role="presentation" width="100%" style="border-collapse:collapse;">'+tabla('Reclamaciones Pagadas', pagadas)+'</table></td></tr>'+
      '<tr><td style="padding:0 18px 18px;color:#767676;font-size:11px;">PASEM · Sección 26 del SNTE · Administrado por MULTICATERIN, S.A. de C.V. con respaldo de BIDA Seguros.</td></tr>'+
    '</table></td></tr></table></body></html>';
}

export { computeInforme, informeEmailHtml, repdirEmailHtml, dayOf, fmtFecha };
