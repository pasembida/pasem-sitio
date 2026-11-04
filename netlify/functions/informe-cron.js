import { computeInforme, repdirEmailHtml, dayOf, fmtFecha } from './lib/informe-core.js';
import { schedule } from '@netlify/functions';

const run = async () => {
  try{
    const key=process.env.RESEND_API_KEY;
    if(!key){ console.log('informe-cron: falta RESEND_API_KEY'); return {statusCode:200}; }
    const data=await computeInforme();
    const from=process.env.INFORME_FROM||process.env.MAIL_FROM||'PASEM <asistenciaseccion26@pasem.com>';
    const to=process.env.INFORME_TO||'bidaseguros@bidaseguros.org';
    const pr=(data.procedimientos||[]);
    const pagadas=pr.filter(s=>s.pagado).length, tramite=pr.length-pagadas;
    const payload={
      from, to:[to],
      subject:'PASEM — Reporte Dirección ('+dayOf(data.generatedAt)+')',
      html: repdirEmailHtml(data),
      text:'Reporte Dirección PASEM — '+fmtFecha(data.generatedAt)+'. Reclamaciones reportadas: '+pr.length+' (en trámite '+tramite+', pagadas '+pagadas+'). Padrón actualizado: '+(data.padronActualizado||data.padronTotal)+'.'
    };
    const r=await fetch('https://api.resend.com/emails',{ method:'POST', headers:{ 'Authorization':'Bearer '+key, 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
    const rd=await r.json().catch(()=>({}));
    if(!r.ok){ console.log('informe-cron: error Resend', r.status, rd && (rd.message||rd.name)); } else { console.log('informe-cron: Reporte Dirección enviado a', to, 'id', rd.id); }
  }catch(e){ console.log('informe-cron: excepción', String(e&&e.message?e.message:e)); }
  return {statusCode:200};
};
export const handler = schedule('0 15 * * *', run);
