/* Standings: points, then the competition's own tiebreak sequence.

RULESETS is data, not code — real events publish real sequences and they
disagree. Groups level on points are settled separately (pairs vs. three or
more), and teams a ruleset cannot separate keep the same rank. */
import { isBracket, isExhibition, played } from "./game.js";
import { state } from "../state.js";
import { bare, norm } from "../util/text.js";

/* Real events publish real sequences and they disagree with each other, so
   the order is data rather than code. Two-team and three-or-more paths are
   separate because most rulebooks separate them: head-to-head settles a pair
   and is meaningless across three clubs who didn't all play each other. */
var RULESETS = {
  none: {
    label: "No published tiebreakers",
    two: [], many: [], shareRank: true,
    note: "This event publishes no tiebreakers, so teams level on points are shown level here."
  },
  goalpercentage: {
    label: "Head-to-head, then goal percentage",
    two: ["h2h","goalpct","diff","fewestga"],
    many: ["goalpct","diff","fewestga"],
    note: "Ties broken by head-to-head, then goal percentage — goals for divided by total goals for and against — then goal differential, then fewest goals against."
  },
  usahockey: {
    label: "USA Hockey",
    two: ["wins","regwins","diff","quotient"],
    many: ["wins","regwins","diff","quotient"],
    cap: 8,
    note: "Ties broken by most wins, then goal differential and goal quotient, each capped at eight goals a game."
  },
  differential: {
    label: "Head-to-head, then differential",
    two: ["h2h","diff","gf"], many: ["diff","gf"],
    note: "Ties broken by head-to-head, then goal differential, then goals for."
  }
};
function rulesFor(v){
  var key = norm(state.data.config.rules||"");
  if(RULESETS[key]) return RULESETS[key];
  // An event nobody seeds gets no invented order.
  if(v && v.event && !v.hasBracket) return RULESETS.none;
  return RULESETS.differential;
}
/* every comparator returns a number: higher is better unless noted */
var METRIC = {
  goalpct:  function(r){ return (r.gf+r.ga)?r.gf/(r.gf+r.ga):0; },
  diff:     function(r,c){ return c?r.cap:r.gf-r.ga; },
  quotient: function(r){ return r.ga?r.gf/r.ga:(r.gf?Infinity:0); },
  fewestga: function(r){ return -r.ga; },
  wins:     function(r){ return r.w; },
  regwins:  function(r){ return r.w; },     // no OT/SO column in the sheet
  gf:       function(r){ return r.gf; }
};

function standings(games, teams, isEvent, rules){
  var cfg=state.data.config, rows=bare(), i, g;
  for(i=0;i<teams.length;i++) rows[teams[i]]={team:teams[i],gp:0,w:0,l:0,t:0,gf:0,ga:0,cap:0,pts:0,h2h:bare()};
  for(i=0;i<games.length;i++){
    g=games[i];
    if(!played(g)) continue;
    if(isExhibition(g)) continue;                      // a scrimmage counts toward nothing
    if(isEvent && isBracket(g)) continue;              // playoffs don't move pool standings
    if(g.home===g.away) continue;
    var h=rows[g.home], a=rows[g.away];
    if(!h||!a) continue;
    h.gp++; a.gp++;
    h.gf+=g.hs; h.ga+=g.as; a.gf+=g.as; a.ga+=g.hs;
    var margin=Math.min((rules&&rules.cap)||99,Math.abs(g.hs-g.as));
    if(g.hs>g.as){
      h.w++; a.l++; h.cap+=margin; a.cap-=margin;
      h.h2h[g.away]=(h.h2h[g.away]||0)+1; a.h2h[g.home]=(a.h2h[g.home]||0)-1;
    } else if(g.hs<g.as){
      a.w++; h.l++; a.cap+=margin; h.cap-=margin;
      a.h2h[g.home]=(a.h2h[g.home]||0)+1; h.h2h[g.away]=(h.h2h[g.away]||0)-1;
    } else { h.t++; a.t++; }
  }
  var out=[];
  for(var k in rows) if(Object.prototype.hasOwnProperty.call(rows,k)){
    var r=rows[k];
    r.pts=r.w*cfg.ptsWin+r.t*cfg.ptsTie+r.l*cfg.ptsLoss;
    r.diff=r.gf-r.ga;
    out.push(r);
  }
  return orderTable(out, rules, isEvent);
}

/* Sort by points, then settle each level group with the event's own sequence.
   A group of exactly two uses the two-team path; three or more use the other
   path, and any pair still level afterwards falls back to the two-team one,
   which is what the rulebooks actually say. */
/* Sorting a standings table is not one sort. Teams level on points form a
   group, and rulebooks settle a group of two differently from a group of
   three or more: head-to-head decides a pair, and means nothing across three
   clubs who did not all play each other. So each group is settled with its
   own sequence, and a group of three that narrows to two adjacent teams gets
   the pair sequence applied to just those two (resettlePairs) — which is what
   the rulebooks actually say to do. Teams a ruleset cannot separate keep the
   same rank number rather than being put in an invented order. */
function orderTable(rows, rules, isEvent){
  rules = rules || RULESETS.differential;
  var groups=bare(), order=[];
  rows.forEach(function(r){
    if(!groups[r.pts]){ groups[r.pts]=[]; order.push(r.pts); }
    groups[r.pts].push(r);
  });
  order.sort(function(a,b){ return b-a; });
  var out=[];
  order.forEach(function(p){
    var g=groups[p];
    if(g.length===1){ g[0].level=false; out.push(g[0]); return; }
    settle(g, g.length===2?rules.two:rules.many, rules);
    if(g.length>2) resettlePairs(g, rules);
    var unresolved = allEqual(g, g.length===2?rules.two:rules.many, rules);
    g.forEach(function(r){ r.level=unresolved; out.push(r); });
  });
  return out;
}
function settle(g, seq, rules){
  g.sort(function(x,y){
    for(var i=0;i<seq.length;i++){
      var k=seq[i];
      if(k==="h2h"){ var res=x.h2h[y.team]||0; if(res!==0) return res>0?-1:1; continue; }
      var f=METRIC[k]; if(!f) continue;
      var a=f(x,rules.cap), b=f(y,rules.cap);
      if(a!==b) return b-a;
    }
    return x.team.localeCompare(y.team);
  });
}
function resettlePairs(g, rules){
  for(var i=0;i<g.length-1;i++){
    if(sameOn(g[i], g[i+1], rules.many, rules)){
      var pair=[g[i],g[i+1]];
      settle(pair, rules.two, rules);
      g[i]=pair[0]; g[i+1]=pair[1];
    }
  }
}
function sameOn(x,y,seq,rules){
  for(var i=0;i<seq.length;i++){
    var k=seq[i]; if(k==="h2h") continue;
    var f=METRIC[k]; if(!f) continue;
    if(f(x,rules.cap)!==f(y,rules.cap)) return false;
  }
  return true;
}
function allEqual(g, seq, rules){
  if(!seq.length) return true;                 // nothing published: everyone stays level
  for(var i=1;i<g.length;i++) if(!sameOn(g[0],g[i],seq,rules)) return false;
  return true;
}

export { RULESETS, rulesFor, standings, orderTable };
