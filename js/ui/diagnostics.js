/* Component: the ?check page.

diagHtml() -> HTML: everything the page knows about the sheet and how it was
read, for the manager. Kicks off the tab-ID lookup when the IDs look wrong. */
import { CFG, DIAG } from "../config.js";
import { played } from "../model/game.js";
import { buildViews, currentView, dataViews, featuredEvent, hasStats } from "../model/views.js";
import { findGids, gidHintMatchesConfig, needGidHelp } from "../sheet/gids.js";
import { state } from "../state.js";
import { esc } from "../util/text.js";

/* How many rinks have an address, and which still need one, so the manager
   knows exactly which Directions links are missing and why. */
function rinksLine(){
  var r=state.data.rinks, k, n=0, missing=[];
  if(!r){
    return state.rinksNote ? '<span class="warn">not read — '+esc(state.rinksNote)+"</span>" : "not read — add a Rinks tab (Rink name, Address) for Directions links (optional)";
  }
  for(k in r){ n++; if(!r[k].address) missing.push(r[k].name); }
  if(!n) return '<span class="warn">tab read, no rinks on it</span>';
  var s='<span class="ok">'+(n-missing.length)+" of "+n+" with an address</span>";
  if(missing.length) s+='   <span class="warn">no address yet: '+esc(missing.join(", "))+"</span>";
  return s;
}

function diagHtml(){
  var L=[];
  L.push("<b>Rink Report setup check</b>\n");
  L.push("Sheet ID     " + (CFG.sheetId&&CFG.sheetId.indexOf("PASTE")===-1
      ? '<span class="ok">'+esc(CFG.sheetId)+"</span>"
      : '<span class="bad">not set — edit index.html and paste your sheet ID</span>'));
  L.push("Tabs         " + esc([CFG.tabs.settings,CFG.tabs.teams,CFG.tabs.schedule,CFG.tabs.stats||"(no stats tab)",CFG.tabs.rinks||"(no rinks tab)"].join("  /  ")));
  L.push("Fetched      " + (state.fetchedAt?'<span class="ok">'+esc(new Date(state.fetchedAt).toLocaleString())+"</span>":(state.loading?"in progress":'<span class="bad">never</span>')));
  if(state.loadError) L.push('Error        <span class="bad">'+esc(state.loadError)+"</span>");
  L.push("");
  L.push("<b>What loaded</b>");
  L.push("Our team     " + (state.data.config.teamName?'<span class="ok">'+esc(state.data.config.teamName)+"</span>":'<span class="bad">blank — set it on the Settings tab</span>'));
  L.push("Mode         " + esc(state.data.config.mode) + "   points " + state.data.config.ptsWin+"/"+state.data.config.ptsTie+"/"+state.data.config.ptsLoss);
  L.push("Teams        " + state.data.teams.length);
  L.push("Games        " + state.data.games.length + "   (" + state.data.games.filter(played).length + " with scores)");
  L.push("Stats        " + (hasStats()
      ? '<span class="ok">'+state.data.stats.skaters.length+" skaters, "+state.data.stats.goalies.length+" goalies</span>"
      : (state.statsNote ? '<span class="warn">not shown — '+esc(state.statsNote)+"</span>" : "not shown — the Player Stats tab hasn't been read yet (optional)")));
  L.push("Rinks        " + rinksLine());
  var vs=buildViews(), evs=dataViews().filter(function(v){ return v.event; }), feat=featuredEvent(evs);
  L.push("Bar          " + esc(vs.map(function(v){ return v.tab; }).join("   |   ")));
  L.push("Events       " + (evs.length ? esc(evs.map(function(v){ return v.label+" ("+v.games.length+", "+v.first+" to "+v.last+(v===feat?", in the bar":"")+")"; }).join("   |   ")) : "none"));
  L.push("Showing      " + esc(currentView().label));
  L.push("Read via     " + (state.routeUsed.length?state.routeUsed.join("   "):"(not fetched)"));
  if(state.routeTrouble.length){
    L.push('<span class="bad">Tab IDs in index.html do not match this sheet — see "Correct tab IDs" below.</span>');
  }
  if(state.headerMap.length){
    L.push("");
    L.push("<b>Which Schedule column is which</b>");
    state.headerMap.forEach(function(m){
      L.push("  "+esc(m)+(m.indexOf("not found")!==-1?'   <span class="bad">&lt;-- fix this</span>':""));
    });
  }
  // Only worth showing when it disagrees with what's already in the file,
  // otherwise it reads like an outstanding chore on a page that's healthy.
  if(state.gidHint && !gidHintMatchesConfig()){
    L.push(""); L.push("<b>Correct tab IDs for this sheet</b>"); L.push(state.gidHint);
  }
  if(state.data.config.teamName && state.data.teams.indexOf(state.data.config.teamName)===-1)
    L.push('<span class="bad">Our team name does not match any row on the Teams tab — check the spelling.</span>');
  L.push("");
  L.push("<b>Warnings</b>");
  if(!state.problems.length) L.push('<span class="ok">none</span>');
  else state.problems.forEach(function(p){ L.push('<span class="warn">- '+esc(p)+"</span>"); });
  L.push("");
  L.push("<b>First rows read from the schedule</b>");
  if(!state.data.games.length) L.push("(none)");
  else state.data.games.slice(0,6).forEach(function(g){
    L.push(esc("  "+g.date+"  "+(g.time||"--")+"  "+(g.away||"TBD")+" at "+(g.home||"TBD")+
      (played(g)?"  "+g.as+"-"+g.hs:"  (no score)")+(g.pool?"  ["+g.pool+"]":"")+(g.type?"  "+g.type:"")));
  });
  L.push("");
  L.push("<b>Request log</b>");
  state.diagLog.forEach(function(m){ L.push("  "+esc(m)); });
  L.push("");
  L.push('<a href="./">back to the page</a>');
  // Only go looking when the tab IDs are actually implicated: they are
  // missing, or the export route they drive came back refusing them. On a
  // page that is reading fine this section is noise, and the lookup is a
  // request nobody needed.
  if(DIAG && needGidHelp() && !state.gidHint && !state.gidLookupStarted){ state.gidLookupStarted=true; findGids(); }
  return '<header class="masthead"><div class="txt"><div class="eyebrow">Diagnostics</div><h1>Setup check</h1></div></header><pre class="diag">'+L.join("\n")+"</pre>";
}

export { diagHtml };
