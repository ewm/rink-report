/* Polling. The page paces its own refresh; the note below says how. */
import { CFG } from "./config.js";
import { played } from "./model/game.js";
import { state } from "./state.js";
import { todayISO } from "./util/dates.js";

/* ---------------------------------------------------------------- polling
   Two hundred phones on the same rink wifi, all refreshing on the same
   120-second beat, is a small stampede aimed at one Google URL, and Google
   answers a stampede with transient errors. So the page paces itself:

     - it polls quickly only while a game is actually being played
     - it slows down when nothing on the sheet has changed
     - every delay gets +/- 25% of jitter, so two phones never line up
     - a hidden tab does not fetch at all

   Nobody has to configure any of this. refreshSeconds still sets the fast
   pace, and everything else is derived from what's in the schedule. */

function gameOnNow(){
  var t=todayISO(), i, g, mins=nowMinutes();
  for(i=0;i<state.data.games.length;i++){
    g=state.data.games[i];
    if(g.date!==t) continue;
    if(played(g)) continue;
    var st=minutesOf(g.time);
    if(st===null) return true;                    // no face-off time: assume today counts
    if(mins>=st-20 && mins<=st+200) return true;  // warmups through a long overtime
  }
  return false;
}
function nowMinutes(){ var d=new Date(); return d.getHours()*60+d.getMinutes(); }
function minutesOf(hhmm){
  var m=/^(\d{1,2}):(\d{2})/.exec(String(hhmm||""));
  return m ? (+m[1])*60 + (+m[2]) : null;
}
function hasGameToday(){
  var t=todayISO();
  for(var i=0;i<state.data.games.length;i++) if(state.data.games[i].date===t) return true;
  return false;
}
function pollDelay(){
  var fast=Math.max(60,CFG.refreshSeconds||120)*1000;
  var base = gameOnNow() ? fast : (hasGameToday() ? fast*3 : fast*8);
  var cap  = gameOnNow() ? fast*4 : fast*15;
  var d=Math.min(cap, base*Math.pow(1.6,Math.min(state.pollQuiet,6)));
  return Math.round(d*(0.75+Math.random()*0.5));    // jitter
}
/* One string that changes whenever anything a parent would notice changes. */
function dataSig(){
  var n=state.data.games.length, s=n+"|"+state.data.teams.length+"|";
  for(var i=0;i<n;i++){ var g=state.data.games[i]; s+=g.date+g.time+g.away+g.home+g.as+g.hs+g.rink+"~"; }
  if(state.data.stats){
    state.data.stats.skaters.forEach(function(p){ s+=p.no+p.name+p.gp+p.g+p.a+p.pim+"~"; });
    state.data.stats.goalies.forEach(function(p){ s+=p.no+p.name+p.gp+p.saves+p.ga+p.w+p.l+"~"; });
  }
  return s;
}
function notePoll(){
  var sig=dataSig();
  if(sig===state.pollSig) state.pollQuiet++; else { state.pollQuiet=0; state.pollSig=sig; }
}
function schedulePoll(){
  if(state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer=setTimeout(function(){
    if(document.hidden) { schedulePoll(); return; }
    loader();
  }, pollDelay());
}


/* The poll needs to call load(), which lives in app.js and imports this
   module. Handing the function over at start-up keeps the dependency one-way. */
var loader=function(){};
function initPoll(loadFn){ loader=loadFn; }

export { initPoll, notePoll, schedulePoll };
