/* The Teams tab -> the team list, league pools and aliases. */
import { log, state } from "../state.js";
import { locateHeader } from "../util/csv.js";
import { bare, clean, norm } from "../util/text.js";

var SPEC_TEAMS = { team:["teamname","team"], pool:["pooldivision","pool","division","group"],
  alias:["alsoknownas","aka","alsoknown","othernames","alternatenames","formerlyknownas","oldname","othername"] };
/* A team name on the Schedule tab is text, not a reference, so renaming a club
   on the Teams tab leaves every game it has ever played pointing at the old
   name. The "Also known as" column is the fix: list the old spelling there and
   both names resolve to the current one. It earns its keep twice a season
   anyway, because the league and a tournament rarely spell a club the same way
   ("Jr Terriers" against "Junior Terriers"). Separate several with commas. */
function shapeTeams(rows){
  var h=locateHeader(rows,SPEC_TEAMS), out=[], pools=bare(), alias=bare();
  if(!h||h.map.team===undefined){ state.problems.push("Couldn't find a “Team name” column on the Teams tab."); return {list:out,pools:pools,alias:alias}; }
  for(var r=h.headerIndex+1;r<rows.length;r++){
    var name=clean(rows[r][h.map.team]);
    if(!name) continue;
    if(out.indexOf(name)===-1) out.push(name);
    if(h.map.pool!==undefined){ var p=clean(rows[r][h.map.pool]); if(p) pools[name]=p; }
    if(h.map.alias!==undefined){
      var raw=clean(rows[r][h.map.alias]);
      if(raw) raw.split(/[,;\/]/).forEach(function(a){
        var k=norm(a);
        // never let an alias hijack a name that is itself a team
        if(k && k!==norm(name)) alias[k]=name;
      });
    }
  }
  var i;
  for(i=0;i<out.length;i++) if(alias[norm(out[i])]) delete alias[norm(out[i])];
  log("teams: "+out.length+(Object.keys(alias).length?", "+Object.keys(alias).length+" alias(es)":""));
  return {list:out,pools:pools,alias:alias};
}

export { shapeTeams };
