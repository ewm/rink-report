/* Reading one tab of the Google Sheet.

Three routes, best first: a published CSV override, the raw export by gid
(never re-types a column), then the gviz tab-name reader (does). Three tries
per route with backoff before moving on. Returns parsed rows. */
import { CFG } from "../config.js";
import { log, state } from "../state.js";
import { parseCSV } from "../util/csv.js";

/* Every way we know of reading one tab, best first. More than one route
   matters: Google hands back the odd transient 404, and the raw export is
   the only route that doesn't re-type columns. */
function routesFor(which){
  var id = encodeURIComponent(CFG.sheetId||""), out=[];
  var over=(CFG.csvOverride||{})[which];
  if(over) out.push({how:"published CSV", url:over});
  var gid=(CFG.gids||{})[which];
  if(gid) out.push({how:"raw export", url:"https://docs.google.com/spreadsheets/d/"+id+"/export?format=csv&gid="+encodeURIComponent(gid)});
  var tab=(CFG.tabs||{})[which]||which;
  out.push({how:"tab name", url:"https://docs.google.com/spreadsheets/d/"+id+"/gviz/tq?tqx=out:csv&headers=0&sheet="+encodeURIComponent(tab)});
  return out;
}
function once(url){
  var u = url + (url.indexOf("?")===-1?"?":"&") + "_=" + Date.now();
  return fetch(u,{cache:"no-store",credentials:"omit"}).then(function(r){
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.text();
  }).then(function(t){
    if(/^\s*</.test(t)) throw new Error("got a web page, not data — the sheet may not be shared publicly");
    return t;
  });
}
function wait(ms){ return new Promise(function(res){ setTimeout(res,ms); }); }

/* Three tries per route with a short backoff, then the next route. A single
   blip from Google used to leave the page sitting on an error banner. */
var BACKOFF=[0,500,1500];
function getCSV(which){
  var routes=routesFor(which), ri=0, ai=0, lastErr=null;
  function attempt(){
    if(ri>=routes.length) throw (lastErr||new Error("no route succeeded"));
    var route=routes[ri];
    return wait(BACKOFF[ai]).then(function(){
      return once(route.url);
    }).then(function(t){
      log("  "+which+" ok via "+route.how+(ai?" (try "+(ai+1)+")":"")+", "+t.length+" bytes");
      state.routeUsed.push(which+"="+route.how);
      return parseCSV(t);
    }).catch(function(e){
      lastErr=new Error(which+" — "+route.how+": "+(e&&e.message?e.message:e));
      log("  "+which+" failed via "+route.how+" try "+(ai+1)+": "+(e&&e.message?e.message:e));
      // The stats tab is optional and may simply not exist yet, so its export
      // failing says nothing about whether the other tab IDs are right.
      if(ai===0 && route.how==="raw export" && which!=="stats") state.routeTrouble.push(which);
      ai++;
      if(ai>=BACKOFF.length){ ai=0; ri++; }
      return attempt();
    });
  }
  log("fetch "+which+" ("+routes.length+" route"+(routes.length===1?"":"s")+")");
  return Promise.resolve().then(attempt);
}

export { routesFor, getCSV };
