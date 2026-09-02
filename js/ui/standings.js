/* Component: the standings table for a view (pooled or flat).

standingsHtml(view, precomputedRows, rules) -> HTML. Pools come from
poolsInView(); a single pool names the section instead of heading it. */
import { isExhibition, played } from "../model/game.js";
import { rulesFor, standings } from "../model/standings.js";
import { poolsInView, teamsInView } from "../model/views.js";
import { state } from "../state.js";
import { bare, esc } from "../util/text.js";

function standingsHtml(v, flat, rules){
  var cfg=state.data.config;
  rules = rules || rulesFor(v);
  var teams=teamsInView(v), pools=poolsInView(v);
  var body="", groups=[], grouped=false, t, soleGroup="";
  /* Ranking a table where nobody has played yet puts a "1" beside all eleven
     clubs, which is technically true and reads as broken. Until a score is in,
     the table is a team list and gets no numbers. */
  var anyPlayed=false;
  v.games.forEach(function(g){ if(played(g) && !isExhibition(g)) anyPlayed=true; });

  if(teams.length){
    for(t in pools) if(Object.prototype.hasOwnProperty.call(pools,t)){ grouped=true; break; }
    if(grouped){
      var byPool=bare();
      teams.forEach(function(tm){ var p=pools[tm]||"Unpooled"; (byPool[p]=byPool[p]||[]).push(tm); });
      Object.keys(byPool).sort().forEach(function(p){ groups.push({name:p, teams:byPool[p]}); });
      // A single pool needs no heading above its own table, so it names the
      // section instead — otherwise the Pool column never reaches the page.
      if(groups.length===1 && groups[0].name){ soleGroup=groups[0].name; groups[0].name=""; }
    } else groups.push({name:"", teams:teams});

    body+='<div class="tablewrap">';
    groups.forEach(function(grp){
      if(grp.name) body+='<div class="poolname">'+esc(grp.name)+"</div>";
      var st=(groups.length===1 && flat) ? flat : standings(v.games, grp.teams, v.event, rules);
      body+='<table><thead><tr><th scope="col">Team</th><th scope="col">GP</th><th scope="col">W</th>'+
        '<th scope="col">L</th><th scope="col">T</th><th scope="col">GF</th><th scope="col">GA</th>'+
        '<th scope="col">+/-</th><th scope="col">Pts</th></tr></thead><tbody>';
      var shownRank=0, prevPts=null, prevLevel=false;
      st.forEach(function(r,i){
        var mine=r.team===cfg.teamName;
        if(!(r.level && prevLevel && r.pts===prevPts)) shownRank=i+1;
        prevPts=r.pts; prevLevel=r.level;
        body+="<tr"+(mine?' class="us"':"")+'><td><span class="rank">'+(anyPlayed?shownRank:"")+"</span>"+esc(r.team)+"</td>"+
          "<td>"+r.gp+"</td><td>"+r.w+"</td><td>"+r.l+"</td><td>"+r.t+"</td><td>"+r.gf+"</td><td>"+r.ga+"</td>"+
          "<td>"+(r.diff>0?"+":"")+r.diff+'</td><td class="pts">'+r.pts+"</td></tr>";
      });
      body+="</tbody></table>";
    });
    body+="</div>";
    var note = rules.note || "";
    if(v.hasBracket) note += (note?" ":"")+"Bracket games are not counted here.";
    var exh=0;
    v.games.forEach(function(g){ if(isExhibition(g)) exh++; });
    if(exh) note += (note?" ":"")+(exh===1?"One scrimmage is":exh+" scrimmages are")+
      " on the schedule but not in this table.";
    if(note) body+='<p class="foot">'+esc(note)+"</p>";
  } else {
    body+='<p class="empty">'+(v.event?"No teams in this event yet.":"No teams loaded yet.")+"</p>";
  }

  // A round robin nobody seeds is not a "pool standing".
  var title = !v.event ? "Standings" : (v.hasBracket ? "Pool standings" : "Round robin");
  if(soleGroup) title = soleGroup;
  return '<section class="card"><div class="card-h"><h2>'+esc(title)+'</h2>'+
    '<span class="eyebrow">'+cfg.ptsWin+" pt win &middot; "+cfg.ptsTie+
    ' pt tie</span></div><div class="card-b">'+body+"</div></section>";
}

export { standingsHtml };
