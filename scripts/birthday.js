'use strict';
const axios = require('axios');

const WEBHOOK   = (process.env.BITRIX_WEBHOOK || '').replace(/\/$/, '');
const TZ_OFFSET = parseInt(process.env.TIMEZONE_OFFSET || '5');
const FORCE     = process.env.FORCE_RUN === 'true';

const R = {
  enabled:     process.env.REMINDER_ENABLED === 'true',
  types:       (process.env.REMINDER_TYPES || '').split(',').map(s=>s.trim()).filter(Boolean),
  offset:      parseInt(process.env.REMINDER_OFFSET_DAYS || '0'),
  time:        process.env.REMINDER_TIME || '09:00',
  responsible: process.env.REMINDER_RESPONSIBLE_ID || '',
};
const M = {
  enabled: process.env.MESSAGE_ENABLED === 'true',
  text:    process.env.MESSAGE_TEXT    || '',
  offset:  parseInt(process.env.MESSAGE_OFFSET_DAYS || '0'),
  time:    process.env.MESSAGE_TIME    || '10:00',
};

const log = (l,m) => console.log(`[${new Date().toISOString()}] [${l.toUpperCase()}] ${m}`);

function localNow() { const d=new Date(); return new Date(d.getTime()+TZ_OFFSET*3600000); }
function hhmm(d) { return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`; }
function parseBday(raw) {
  if (!raw) return null;
  const m = raw.match(/\d{4}-(\d{2})-(\d{2})/);
  if (!m) return null;
  const now = localNow();
  return new Date(Date.UTC(now.getUTCFullYear(), +m[1]-1, +m[2]));
}
function addDays(d,n) { const r=new Date(d); r.setUTCDate(r.getUTCDate()+n); return r; }
function sameDay(a,b) { return a.getUTCFullYear()===b.getUTCFullYear()&&a.getUTCMonth()===b.getUTCMonth()&&a.getUTCDate()===b.getUTCDate(); }
function tpl(t,c) { return t.replace(/\{NAME\}/g,c.NAME||'').replace(/\{LAST_NAME\}/g,c.LAST_NAME||'').replace(/\{FULL_NAME\}/g,[c.NAME,c.LAST_NAME].filter(Boolean).join(' ')); }
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function bx(method,params={}) {
  const {data} = await axios.post(`${WEBHOOK}/${method}.json`,params,{timeout:20000});
  if (data.error) throw new Error(`${method}: ${data.error_description||data.error}`);
  return data.result;
}

async function loadContacts() {
  const all=[]; let start=0;
  while(true){
    const res=await bx('crm.contact.list',{select:['ID','NAME','LAST_NAME','BIRTHDATE','ASSIGNED_BY_ID'],filter:{'!=BIRTHDATE':''},start});
    if(!res?.length) break;
    all.push(...res.filter(c=>c.BIRTHDATE));
    if(res.length<50) break;
    start+=50; await sleep(400);
  }
  return all;
}

async function sendMsg(c,text) {
  try {
    const chats=await bx('imconnector.crm.data.get',{ENTITY_TYPE:'contact',ENTITY_ID:c.ID});
    if(chats?.length){
      const ch=chats[chats.length-1];
      await bx('imconnector.send.messages',{CONNECTOR:ch.CONNECTOR_ID,LINE:ch.LINE_ID,MESSAGES:[{user:{id:c.ID,name:[c.NAME,c.LAST_NAME].filter(Boolean).join(' ')},message:{text},chat:{id:ch.CHAT_ID}}]});
      log('info',`WA(${ch.CONNECTOR_ID}): ${c.NAME}`); return;
    }
  } catch(e){ log('warn',`no open channel #${c.ID}: ${e.message}`); }
  await bx('crm.timeline.comment.add',{fields:{ENTITY_ID:+c.ID,ENTITY_TYPE:'contact',COMMENT:text}});
  log('info',`CRM comment: ${c.NAME}`);
}

async function main() {
  if(!WEBHOOK){log('error','BITRIX_WEBHOOK not set');process.exit(1);}
  const now=localNow(), nowHM=hhmm(now);
  log('info',`BirthdayBot UTC+${TZ_OFFSET} ${now.toISOString()} ${nowHM}`);
  const doR=FORCE||(R.enabled&&R.time.substring(0,5)===nowHM);
  const doM=FORCE||(M.enabled&&M.time.substring(0,5)===nowHM);
  if(!doR&&!doM){log('info',`skip ${nowHM}`);return;}
  const contacts=await loadContacts();
  log('info',`contacts: ${contacts.length}`);
  let rOk=0,mOk=0,err=0;
  for(const c of contacts){
    const bday=parseBday(c.BIRTHDATE); if(!bday) continue;
    const name=[c.NAME,c.LAST_NAME].filter(Boolean).join(' ')||'#'+c.ID;
    const resp=R.responsible||c.ASSIGNED_BY_ID||'1';
    if(doR&&R.enabled&&R.types.length&&sameDay(addDays(bday,-R.offset),now)){
      const subj=`День рождения: ${name}`;
      const desc=R.offset===0?'сегодня':R.offset>0?`через ${R.offset} дн.`:`за ${Math.abs(R.offset)} дн.`;
      for(const t of R.types){
        try{
          if(t==='activity') await bx('crm.activity.add',{fields:{OWNER_TYPE_ID:3,OWNER_ID:+c.ID,TYPE_ID:6,SUBJECT:subj,DESCRIPTION:desc,RESPONSIBLE_ID:+resp||1,COMPLETED:'N',PRIORITY:2,DEADLINE:new Date(Date.now()+86400000).toISOString()}});
          if(t==='task') await bx('tasks.task.add',{fields:{TITLE:subj,DESCRIPTION:desc,RESPONSIBLE_ID:+resp||1,DEADLINE:new Date(Date.now()+86400000).toISOString(),UF_CRM_TASK:[`C_${c.ID}`],PRIORITY:1}});
          if(t==='notification') await bx('im.notify.system.add',{USER_ID:+resp,MESSAGE:`${subj}\n${desc}`});
          log('info',`${t}: ${name}`); rOk++;
        }catch(e){log('error',`${t} ${name}: ${e.message}`);err++;}
        await sleep(300);
      }
    }
    if(doM&&M.enabled&&M.text&&sameDay(addDays(bday,-M.offset),now)){
      try{await sendMsg(c,tpl(M.text,c));mOk++;}
      catch(e){log('error',`msg ${name}: ${e.message}`);err++;}
      await sleep(300);
    }
  }
  log('info',`Done r:${rOk} m:${mOk} e:${err}`);
  if(err) process.exit(1);
}
main().catch(e=>{log('error','Fatal: '+e.message);process.exit(1);});
