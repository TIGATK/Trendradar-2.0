import { readFile, writeFile } from 'node:fs/promises';
const cfg = JSON.parse(await readFile('config/topics.json','utf8'));
const DAYS=90, today=new Date();
const key=d=>d.toISOString().slice(0,10);
const dayAt=n=>key(new Date(today.getTime()-(DAYS-1-n)*86400000));
const rnd=(s=>()=>((s=s*16807%2147483647)/2147483647))(42);

const profile={epa:[3.2,1.4],erezept:[2.1,.9],ti20:[1.1,.6],gateway:[1.6,1.2],
 identitaet:[.8,.5],kommunikation:[.7,.4],zulassung:[1.0,.5],sicherheit:[.9,1.4],
 recht:[1.3,.7],'ki-daten':[.6,.4],versorgung:[.5,.3],sonstiges:[.8,.3]};

const heads={
 epa:['ePA für alle: Befüllungsquote in Praxen steigt','Widerspruchsmanagement bereitet Kassen Aufwand','Kliniken melden Integrationsprobleme mit der Akte'],
 erezept:['CardLink-Verfahren jetzt bei weiteren Apotheken','E-Rezept-Zahlen erreichen neuen Höchststand'],
 gateway:['Konnektor-Laufzeitverlängerung: Übergangsfrist läuft','TI-Gateway-Migration kommt schleppend voran'],
 sicherheit:['BSI warnt vor Schwachstelle in Praxissoftware','Klinikverbund nach Angriff tagelang offline'],
 ti20:['Zero-Trust-Architektur: gematik stellt Konzept vor'],
 recht:['Referentenentwurf zur Digitalisierung liegt vor'],
 zulassung:['Neue Spezifikationsstufe veröffentlicht'],
 identitaet:['GesundheitsID: Kassen melden Nutzerzahlen'],
 kommunikation:['KIM-Nachrichtenvolumen wächst weiter'],
 'ki-daten':['Forschungsdatenzentrum nimmt Anträge an'],
 versorgung:['DiGA-Verzeichnis um Anwendungen erweitert'],
 sonstiges:['Branchentreffen kündigt Programm an']};

const roll=(a,w=7)=>a.map((_,i)=>{const s=a.slice(Math.max(0,i-w+1),i+1);
  return +(s.reduce((x,y)=>x+y,0)/s.length).toFixed(2);});

const topics=cfg.topics.map(t=>{
  const [base,amp]=profile[t.id]||[.5,.3];
  const counts={}, series=[];
  for(let i=0;i<DAYS;i++){
    const trend=base*(1+.5*Math.sin(i/14)+ (i/DAYS)*(t.id==='epa'?.8:t.id==='sicherheit'?.5:0));
    const v=Math.max(0,Math.round(trend+amp*(rnd()*2-1)*2));
    series.push(v); if(v) counts[dayAt(i)]=v;
  }
  const sum=a=>a.reduce((x,y)=>x+y,0);
  // Oeffentliches Interesse: nur Themen mit Wikipedia-Artikel
  const hasI=['epa','erezept','gematik','identitaet','versorgung','sonstiges'].includes(t.id);
  const iSeries=[], iCounts={};
  for(let i=0;i<DAYS;i++){
    if(!hasI){iSeries.push(0);continue;}
    const wd=new Date(today.getTime()-(DAYS-1-i)*86400000).getUTCDay();
    const week=(wd===0||wd===6)?0.55:1;
    const v=Math.round((120+base*45)*week*(1+.18*Math.sin(i/21))+rnd()*30);
    iSeries.push(v); iCounts[dayAt(i)]=v;
  }
  const mk=(arr,counts)=>({counts,series:arr,smooth:roll(arr),total:sum(arr),
    last7:sum(arr.slice(-7)),prev7:sum(arr.slice(-14,-7)),
    momentum: sum(arr.slice(-14,-7))>0 ? +(sum(arr.slice(-7))/sum(arr.slice(-14,-7))).toFixed(2)
              : (sum(arr.slice(-7))>0?null:0),
    hat: arr.some(v=>v>0)});
  return {id:t.id,name:t.name,cmsKategorie:t.cmsKategorie||null,color:t.color,desc:t.desc,
    signals:{aktivitaet:mk(series,counts), interesse:mk(iSeries,iCounts)},
    orgs:{epa:['gematik','GKV-Spitzenverband','KBV'],erezept:['ABDA','gematik'],
      sicherheit:['BSI','CCC'],gateway:['CompuGroup','RISE']}[t.id]||[],
    people:[],
    heads:(heads[t.id]||[]).map((h,k)=>{const d=new Date(today.getTime()-k*2*86400000);
      return {t:h,s:'Beispielquelle',d:String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.',
              u:'https://example.org/beispiel',iso:key(d)};}),
    note:''};
});
const grand=topics.reduce((a,t)=>a+t.signals.aktivitaet.last7,0)||1;
topics.forEach(t=>t.share=+(t.signals.aktivitaet.last7/grand).toFixed(3));

const snap={schema:3,live:false,
  signale:[
    {id:'aktivitaet',name:'Branchenaktivität',einheit:'Beiträge',aktiv:true,
     desc:'Erwähnungen in Fachpresse, Pressestellen und offenen Social-Netzwerken. Was in der Branche passiert.'},
    {id:'interesse',name:'Öffentliches Interesse',einheit:'Abrufe',aktiv:true,
     desc:'Abrufe der einschlägigen Wikipedia-Artikel. Wonach unabhängig von einzelnen Anbietern gesucht wird.'},
  ],generated:new Date().toISOString(),today:key(today),
  startDate:dayAt(0),endDate:key(today),days:DAYS,
  stats:{beitraege:topics.reduce((a,t)=>a+t.signals.aktivitaet.total,0),quellenOk:14,quellenFehler:4,laufzeitSek:0},
  sources:[
    {name:'gematik Newsroom',url:'https://www.gematik.de/rss',type:'RSS',status:'ok',items:18},
    {name:'aerzteblatt Politik',url:'https://www.aerzteblatt.de/rss/nachrichten.asp',type:'RSS',status:'ok',items:24},
    {name:'E-HEALTH-COM',url:'https://e-health-com.de/feed/',type:'RSS',status:'ok',items:15},
    {name:'heise Newsticker',url:'https://www.heise.de/rss/heise-atom.xml',type:'RSS',status:'ok',items:9},
    {name:'Beispielquelle mit Fehler',url:'https://example.org/feed',type:'RSS',status:'fehler',items:0,error:'HTTP 404'},
    {name:'Bluesky: Telematikinfrastruktur',url:'https://bsky.app',type:'Social',status:'ok',items:12},
    {name:'Mastodon: #ePA',url:'https://mastodon.social',type:'Social',status:'fehler',items:0,error:'HTTP 401 - Instanz verlangt Anmeldung'},
    {name:'Wikipedia: Elektronische Patientenakte',url:'https://de.wikipedia.org/wiki/Elektronische_Patientenakte',type:'Nachfrage',status:'ok',items:3110},
    {name:'Wikipedia: Telematikinfrastruktur',url:'https://de.wikipedia.org/wiki/Telematikinfrastruktur',type:'Nachfrage',status:'ok',items:2740}
  ],
  topics,
  roadmap:[{datum:key(new Date(today.getTime()+18*86400000)),topic:'zulassung',
    text:'BEISPIELTERMIN - durch echten Termin ersetzen',quelle:'https://www.gematik.de/',geprueft:null,genauigkeit:'monat'},
    {datum:key(new Date(today.getTime()+41*86400000)),topic:'epa',
    text:'BEISPIELTERMIN - durch echten Termin ersetzen',quelle:'https://www.gematik.de/',geprueft:null,genauigkeit:'monat'}]};
await writeFile('public/data/snapshots.json', JSON.stringify(snap,null,2)+'\n');
console.log('Beispieldaten geschrieben:', topics.length,'Themen,',snap.stats.beitraege,'Beitraege');
