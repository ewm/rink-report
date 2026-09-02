/* app.js — the entry point. Wires the store to the page and starts the loop.

   Boot:  paint from cache -> fetch every tab -> shape -> render -> poll.
   Input: one delegated click handler (data-act attributes) and the
          visibility change that refetches when a phone comes back.

   See ARCHITECTURE.md for the module map. */
import { CFG } from "./config.js";
import { state, log, onChange, notify } from "./state.js";
import { render } from "./render.js";
import { getCSV } from "./sheet/routes.js";
import { shapeSettings } from "./shape/settings.js";
import { shapeTeams } from "./shape/teams.js";
import { shapeGames } from "./shape/games.js";
import { shapeStats } from "./shape/stats.js";
import { saveCache, loadCache } from "./cache.js";
import { initPoll, notePoll, schedulePoll } from "./poll.js";
import { tickFresh } from "./ui/chrome.js";

onChange(render);

function load(){
  state.loading=true; state.loadError=""; state.problems=[]; state.routeUsed=[]; state.headerMap=[]; state.routeTrouble=[]; state.statsNote="";
  // A page that already has content keeps it while the refetch runs.
  if(!state.data.games.length) render(); else tickFresh();
  // The stats tab rides along but never gates the page: a missing or broken
  // Player Stats tab costs the Stats tab and nothing else.
  var statsRead = (CFG.tabs&&CFG.tabs.stats) || (CFG.gids&&CFG.gids.stats) || (CFG.csvOverride&&CFG.csvOverride.stats)
    ? getCSV("stats").catch(function(e){ state.statsNote=(e&&e.message)?e.message:"could not be read"; log("  stats: giving up, the tab is optional"); return null; })
    : Promise.resolve(null);
  Promise.all([getCSV("settings"),getCSV("teams"),getCSV("schedule"),statsRead]).then(function(res){
    var cfg=shapeSettings(res[0]);
    var tm=shapeTeams(res[1]);
    var next={ config:cfg, teams:tm.list, pools:tm.pools, games:[], stats:null };
    var prev=state.data; state.data=next;                       // shapeGames reads state.data.config
    next.games=shapeGames(res[2], tm.list, tm.alias);
    next.stats=res[3] ? shapeStats(res[3]) : null;
    // A fetch that failed outright keeps the last good copy, the way the
    // schedule does. A tab that was read but held nothing is dropped.
    if(res[3]===null && prev.stats){ next.stats=prev.stats; log("  stats: keeping the previous copy"); }
    if(!next.games.length && prev.games.length && !state.problems.length){
      state.data=prev; state.problems.push("The Schedule tab came back empty, so the last good copy is still showing.");
    }
    if(state.routeTrouble.length){
      state.problems.push("The tab IDs in index.html belong to a different sheet, so the page is falling back to the slower reader. "+
        "That fallback is what blanks headers. Open Setup check — it works out the right numbers for this sheet and prints the line to paste into index.html.");
    }
    state.fetchedAt=Date.now(); state.loading=false; saveCache(); render(); notePoll(); schedulePoll();
  }).catch(function(e){
    state.loading=false; state.loadError=(e&&e.message)?e.message:"Unknown error";
    log("FAILED: "+state.loadError); render(); state.pollQuiet=Math.max(state.pollQuiet,2); schedulePoll();
  });
}

document.addEventListener("click",function(e){
  var el=e.target.closest?e.target.closest("[data-act]"):null;
  if(!el) return;
  var a=el.getAttribute("data-act");
  if(a==="filter"){ state.filterOurs=el.getAttribute("data-v")==="ours"; render(); }
  if(a==="view"){
    state.viewKey=el.getAttribute("data-v"); render();
    try{ window.scrollTo(0,0); }catch(err){}
  }
  if(a==="refresh"){ state.pollQuiet=0; load(); }
});
document.addEventListener("visibilitychange",function(){
  if(!document.hidden && state.fetchedAt && Date.now()-state.fetchedAt > (CFG.refreshSeconds||120)*1000) load();
});
setInterval(function(){ if(!document.hidden) tickFresh(); }, 30000);        // keeps "updated N ago" honest

/* logo.png is optional. It's probed once at startup rather than inserted and
   removed on every render, which was shoving the masthead text sideways. */
(function probeCrest(){
  try{
    var img=new Image();
    img.onload=function(){ if(img.naturalWidth>0){ state.logoOk=true; notify(); } };
    img.onerror=function(){ state.logoOk=false; };
    img.src="logo.png";
  }catch(e){ state.logoOk=false; }
})();

initPoll(load);
loadCache();
render();
load();
