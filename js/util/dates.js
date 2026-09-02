/* Dates and times, in the five spellings a sheet actually contains.

Everything internal is an ISO day string (YYYY-MM-DD) so comparisons are
plain string comparisons. Nothing here knows about games or views. */
import { clean } from "./text.js";

var DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
var MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var MONIDX={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
function pad(n){return (n<10?"0":"")+n;}
function toISO(y,m,d){return y+"-"+pad(m+1)+"-"+pad(d);}
/* Accepts 2026-11-14, 11/14/2026, 14 Nov 2026, Nov 14 2026, Date(2026,10,14),
   and Sheets' serial numbers. Returns YYYY-MM-DD or "". */
function parseDate(v){
  var s=clean(v); if(!s) return "";
  var m;
  if((m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return toISO(+m[1],+m[2]-1,+m[3]);
  if((m=/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)/.exec(s))) return toISO(+m[1],+m[2],+m[3]);
  if((m=/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s))){
    var y=+m[3]; if(y<100) y+=2000;
    return toISO(y,+m[1]-1,+m[2]);                 // US order: month first
  }
  if((m=/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/.exec(s))){
    var mi=MONIDX[m[1].slice(0,3).toLowerCase()];
    if(mi!==undefined) return toISO(+m[3],mi,+m[2]);
  }
  if((m=/^(\d{1,2})\s+([A-Za-z]{3,}),?\s+(\d{4})/.exec(s))){
    var mj=MONIDX[m[2].slice(0,3).toLowerCase()];
    if(mj!==undefined) return toISO(+m[3],mj,+m[1]);
  }
  if(/^\d{5}$/.test(s)){                            // Sheets serial date
    var base=Date.UTC(1899,11,30)+(+s)*86400000, d=new Date(base);
    return toISO(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
  }
  return "";
}
function dateObj(iso){ var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||""); return m?new Date(+m[1],+m[2]-1,+m[3]):null; }
function fmtDate(iso){ var d=dateObj(iso); return d?DOW[d.getDay()]+" "+MON[d.getMonth()]+" "+d.getDate():""; }
function todayISO(){ var d=new Date(); return toISO(d.getFullYear(),d.getMonth(),d.getDate()); }
function daysUntil(iso){ var d=dateObj(iso), t=dateObj(todayISO()); return (d&&t)?Math.round((d-t)/86400000):null; }
function countdownText(iso){
  var n=daysUntil(iso);
  if(n===null||n<0) return "";
  if(n===0) return "TODAY";
  if(n===1) return "TOMORROW";
  if(n<7) return "IN "+n+" DAYS";
  var w=Math.round(n/7); return "IN "+w+" WEEK"+(w===1?"":"S");
}
/* "7:10 PM", "19:10", "7:10p" -> minutes since midnight, for sorting */
function timeKey(t){
  var s=clean(t).toLowerCase(), m=/^(\d{1,2})[:.](\d{2})\s*(a|p)?/.exec(s);
  if(!m) m=/^(\d{1,2})()\s*(a|p)/.exec(s);          // "7 PM" with no minutes
  if(!m) return 9999;
  var h=+m[1], mi=+(m[2]||0);
  if(m[3]==="p"&&h<12) h+=12;
  if(m[3]==="a"&&h===12) h=0;
  return h*60+mi;
}
function ago(ts){
  if(!ts) return "";
  var s=Math.max(0,Math.round((Date.now()-ts)/1000));
  if(s<45) return "just now";
  if(s<90) return "1 min ago";
  if(s<3600) return Math.round(s/60)+" min ago";
  if(s<7200) return "1 hour ago";
  if(s<86400) return Math.round(s/3600)+" hours ago";
  var d=Math.round(s/86400); return d+" day"+(d===1?"":"s")+" ago";
}

/* "Fri Aug 28 – Sun Aug 30", or one date for a one-day event. */
function dateRange(a,b){
  if(!a) return "";
  return (a===b||!b) ? fmtDate(a) : fmtDate(a)+" – "+fmtDate(b);
}

export { DOW, MON, parseDate, dateObj, fmtDate, todayISO, daysUntil, countdownText, timeKey, ago, dateRange };
