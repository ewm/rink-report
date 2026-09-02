/* Views: what the data contains, and what the bar shows.

dataViews()  every view the schedule implies — league play plus one per
             named event, derived, never configured.
buildViews() the BAR: league, the one live-or-next event, Events, Stats.
currentView() the view on screen, from viewKey or from the calendar. */
import { isBracket, isExhibition, isOurs, played } from "./game.js";
import { state } from "../state.js";
import { daysUntil, todayISO } from "../util/dates.js";
import { bare, norm } from "../util/text.js";

/* One dataset, several views. A schedule row with a blank Event column is
   league play; anything else belongs to that named event. Views are derived
   from the data, so adding a showcase to the sheet makes it appear.

   What appears in the BAR is a smaller matter. By February a season carries
   the pre-season showcase, two tournaments and a playoff, and a bar that
   names every one of them is a bar nobody can read. So the bar shows league
   play, the one event that is happening now or next, an Events tab that
   lists all of them, and Stats. A past event opened from that list renders
   in full; it just doesn't get its own button. */
function dataViews(){
  var league=[], byEvent=bare(), order=[];
  state.data.games.forEach(function(g){
    if(!g.event){ league.push(g); return; }
    if(!byEvent[g.event]){ byEvent[g.event]=[]; order.push(g.event); }
    byEvent[g.event].push(g);
  });
  order.sort(function(a,b){
    var fa=firstDate(byEvent[a]), fb=firstDate(byEvent[b]);
    return fa<fb?-1:(fa>fb?1:a.localeCompare(b));
  });
  var out=[];
  if(league.length || !order.length) out.push({key:"league", label:"League play", tab:"League", games:league, event:false, hasBracket:false});
  order.forEach(function(n){
    var gs=byEvent[n], hasBracket=false;
    gs.forEach(function(g){ if(isBracket(g)) hasBracket=true; });
    out.push({key:"ev:"+n, label:n, tab:tabLabel(n), games:gs, event:true, hasBracket:hasBracket,
      first:firstDate(gs), last:lastDate(gs)});
  });
  return out;
}
function isLive(v){
  var live=false;
  v.games.forEach(function(g){ var d=daysUntil(g.date); if(d!==null && d>=-1 && d<=1) live=true; });
  return live;
}
/* The event that earns a button: one being played this weekend, else the
   next one on the calendar. Nothing, once the last event of the season is
   over — the bar shouldn't advertise a tournament that already happened. */
function featuredEvent(views){
  var i, today=todayISO(), next=null;
  for(i=0;i<views.length;i++) if(views[i].event && isLive(views[i])) return views[i];
  for(i=0;i<views.length;i++){
    var v=views[i];
    if(!v.event || v.first<today) continue;
    if(!next || v.first<next.first) next=v;
  }
  return next;
}
function buildViews(){
  var all=dataViews(), out=[], feat=featuredEvent(all), others=0, i;
  for(i=0;i<all.length;i++) if(!all[i].event) out.push(all[i]);
  if(feat) out.push(feat);
  for(i=0;i<all.length;i++) if(all[i].event && all[i]!==feat) others++;
  if(others) out.push({key:"events", label:"Tournaments & showcases", tab:"Events", games:[], event:false, hasBracket:false, events:true});
  // Player stats are a view of their own, and only when there are some: a
  // Stats tab that opens on nothing is a promise the page can't keep.
  if(hasStats()) out.push({key:"stats", label:"Player stats", tab:"Stats", games:[], event:false, hasBracket:false, stats:true});
  return out;
}
function hasStats(){ return !!(state.data.stats && (state.data.stats.skaters.length || state.data.stats.goalies.length)); }
/* The masthead record chip always shows league play, whatever tab is open. */
function leagueView(views){
  for(var i=0;i<views.length;i++) if(!views[i].event && !views[i].stats && !views[i].events) return views[i];
  return views[0];
}
function firstDate(gs){ var d="9999-99-99"; gs.forEach(function(g){ if(g.date<d) d=g.date; }); return d; }
function lastDate(gs){ var d="0000-00-00"; gs.forEach(function(g){ if(g.date>d) d=g.date; }); return d; }
function tabLabel(n){
  if(n.length<=18) return n;
  var cut=n.slice(0,17).replace(/\s+\S*$/,"");
  return (cut||n.slice(0,17))+"…";
}
function currentView(){
  var bar=buildViews(), vs=dataViews(), i;
  if(state.viewKey){
    for(i=0;i<bar.length;i++) if(bar[i].key===state.viewKey) return bar[i];
    for(i=0;i<vs.length;i++) if(vs[i].key===state.viewKey) return vs[i];   // an event opened from the Events list
  }
  // with nothing chosen, open on whatever is happening this weekend
  for(i=0;i<vs.length;i++) if(vs[i].event && isLive(vs[i])) return vs[i];
  // otherwise the Settings tab decides which one the page opens on
  if(norm(state.data.config.mode)==="showcase"){
    var near=null, best=1e9;
    for(i=0;i<vs.length;i++){
      if(!vs[i].event) continue;
      vs[i].games.forEach(function(g){
        var d=daysUntil(g.date);
        if(d===null) return;
        var dist=Math.abs(d);
        if(dist<best){ best=dist; near=vs[i]; }
      });
    }
    if(near) return near;
  }
  return bar[0];
}
/* Which bar button lights up for a view: its own, or Events for an event
   that was opened from the list. */
function barKeyFor(views, v){
  for(var i=0;i<views.length;i++) if(views[i].key===v.key) return v.key;
  return v.event ? "events" : (views[0]?views[0].key:"");
}
/* A standings table lists the clubs you actually play in that competition.
   A club that only turns up in scrimmages, or only at a showcase, has no
   business sitting at 0-0-0 in the league table all season. */
function teamsInView(v){
  var seen=bare();
  v.games.forEach(function(g){
    if(isExhibition(g)) return;
    if(g.home) seen[g.home]=1;
    if(g.away) seen[g.away]=1;
  });
  var list=state.data.teams.filter(function(t){ return seen[t]; });
  // Before a single fixture is typed in, the Teams tab is all there is to go on.
  return list.length ? list : state.data.teams;
}
/* Pool membership belongs to the event, not to the team: a club can be in
   Pool A at one showcase and Pool B at the next. League divisions still come
   from the Teams tab. */
function poolsInView(v){
  if(!v.event) return state.data.pools||{};
  var map=bare();
  v.games.forEach(function(g){
    if(!g.pool) return;
    if(g.home) map[g.home]=g.pool;
    if(g.away) map[g.away]=g.pool;
  });
  return map;
}

/* Our own line at an event: every game we played there, bracket included,
   because this is our record and not a pool standing. */
function ourRecordIn(v){
  var us=state.data.config.teamName, w=0,l=0,t=0,gp=0;
  if(!us) return null;
  v.games.forEach(function(g){
    if(!isOurs(g) || !played(g) || isExhibition(g)) return;
    var o=g.home===us?g.hs:g.as, x=g.home===us?g.as:g.hs;
    gp++; if(o>x) w++; else if(o<x) l++; else t++;
  });
  return gp ? {gp:gp,w:w,l:l,t:t} : null;
}

export { dataViews, isLive, featuredEvent, buildViews, hasStats, leagueView, currentView, barKeyFor, teamsInView, poolsInView, ourRecordIn };
