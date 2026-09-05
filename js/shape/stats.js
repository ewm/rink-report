/* The Player Stats tab -> skater and goalie totals.

Reads only the two totals blocks, anchored on the "Player" and "Goalie"
headers, with numeric headers matched by name or by position. Names leave
here as first name + last initial; the full name never enters the model. */
import { log, state } from "../state.js";
import { clean, norm } from "../util/text.js";

/* The Player Stats tab holds several blocks side by side: skater totals,
   goalie totals, then the game logs that feed them. The page reads the two
   totals blocks, and only those — the sheet's formulas do the adding, so the
   page and the sheet can never disagree.

   Each block is found by its one text header that survives every route:
   "Player" for skaters, "Goalie" for goalies. The numeric headers beside them
   ("GP", "PTS") are exactly what Google's tab-name reader blanks, so they are
   matched by name when present and by position — the column after Player is
   GP, then G, A, PTS, PIM — when not. A row is a player until the name cell
   goes blank.

   Names come out as first name and last initial. That is deliberate: the page
   is public, and a kid's full name has no business on it. */
var SPEC_SKATER = { gp:["gp","gamesplayed","games"], g:["g","goals"], a:["a","assists"],
  pts:["pts","points","p"], pim:["pim","penaltyminutes","penaltymin"] };
var SPEC_GOALIE = { gp:["gp","gamesplayed","games"], min:["min","mins","minutes"], saves:["saves","sv"],
  ga:["ga","goalsagainst"], svpct:["svpct","savepct","savepercentage"], gaa:["gaa","goalsagainstaverage","goalsagainstavg"], so:["so","shutouts"],
  w:["w","wins"], l:["l","losses"] };
var NUMBER_HEADS = ["no","num","number","jersey"];

/* "1.5", "0.", "0.792" and "1,234" are all numbers here; "" and "-" are not. */
function numf(v){
  var s=clean(v).replace(/,/g,"");
  if(s==="" || s==="-" || s==="—") return null;
  if(!/^-?\d*\.?\d*$/.test(s) || s==="." || s==="-") return null;
  var n=parseFloat(s);
  return isNaN(n)?null:n;
}
function shortName(full){
  var parts=clean(full).split(" ").filter(function(p){ return p; });
  if(parts.length<2) return parts.join(" ");
  var last=parts[parts.length-1], first=parts.slice(0,-1).join(" ");
  // "O'Connell" -> "O.", "St. Pierre" -> "S." — the first letter that is a letter
  var m=/[A-Za-zÀ-ɏ]/.exec(last);
  return first+" "+(m?m[0].toUpperCase()+".":last);
}
/* Map the headers of one block: named where the name survived, positional
   where it didn't. anchor is the column holding "Player" or "Goalie"; the
   block ends at `end` (the next block's anchor, or the row's width). */
function blockColumns(row, anchor, end, canonical, spec){
  var map={}, claimed={}, c, h, k, i;
  claimed[anchor]=1;
  for(c=anchor+1;c<end;c++){
    h=norm(row[c]); if(!h) continue;
    // "SV%" loses its % in norm() and reads as "sv", which would claim the
    // Saves column when Google has blanked the real Saves header. A percent
    // sign means a percentage and nothing else.
    if(/%/.test(String(row[c]))){
      for(k in spec) if(Object.prototype.hasOwnProperty.call(spec,k) && k.indexOf("pct")!==-1 && map[k]===undefined){ map[k]=c; claimed[c]=1; break; }
      continue;
    }
    for(k in spec) if(Object.prototype.hasOwnProperty.call(spec,k)){
      if(map[k]!==undefined || k.indexOf("pct")!==-1) continue;
      if(spec[k].indexOf(h)!==-1){ map[k]=c; claimed[c]=1; break; }
    }
  }
  var positional=[];
  for(i=0;i<canonical.length;i++){
    k=canonical[i];
    if(map[k]!==undefined) continue;
    c=anchor+1+i;
    if(c<end && !claimed[c]){ map[k]=c; claimed[c]=1; positional.push(k); }
  }
  // the jersey number sits just left of the name
  map.no = anchor>0 ? anchor-1 : undefined;
  for(c=anchor-1;c>=0 && c>=anchor-2;c--) if(NUMBER_HEADS.indexOf(norm(row[c]))!==-1){ map.no=c; break; }
  map.name=anchor;
  return {map:map, positional:positional};
}
function shapeStats(rows){
  var out={skaters:[], goalies:[]}, r, c, hdr=-1, pc=-1, gc=-1, width=0;
  for(r=0;r<Math.min(rows.length,25) && hdr<0;r++){
    for(c=0;c<rows[r].length;c++){
      var h=norm(rows[r][c]);
      if(h==="player" && pc<0) pc=c;
      else if(h==="goalie" && gc<0) gc=c;
    }
    if(pc>=0||gc>=0) hdr=r; else { pc=-1; gc=-1; }
  }
  if(hdr<0){
    state.statsNote="no Player / Goalie header row found";
    state.problems.push("Player Stats tab: couldn't find the header row. Row 2 should have a Player column and a Goalie column, each with its totals to the right.");
    return null;
  }
  for(r=0;r<rows.length;r++) if(rows[r].length>width) width=rows[r].length;
  var head=rows[hdr];
  function readBlock(anchor, end, canonical, spec, shape){
    if(anchor<0) return [];
    var cols=blockColumns(head, anchor, end, canonical, spec), list=[];
    if(cols.positional.length) log("stats: "+(shape==="s"?"skater":"goalie")+" headers placed by position -> "+cols.positional.join(", "));
    for(var rr=hdr+1; rr<rows.length; rr++){
      var name=clean(rows[rr][anchor]);
      if(!name) break;                                    // the block ends at the first blank name
      var row=rows[rr], o={name:shortName(name), no:cols.map.no!==undefined?numf(row[cols.map.no]):null};
      for(var k in cols.map) if(Object.prototype.hasOwnProperty.call(cols.map,k) && k!=="no" && k!=="name")
        o[k]=numf(row[cols.map[k]]);
      list.push(o);
    }
    return list;
  }
  // Each block runs from its anchor to the next block's anchor. The game logs
  // further right start with a Date column, which is where the goalie block ends.
  var logStart=width;
  for(c=Math.max(pc,gc)+1;c<head.length;c++) if(norm(head[c])==="date"){ logStart=c; break; }
  out.skaters=readBlock(pc, gc>pc?gc:logStart, ["gp","g","a","pts","pim"], SPEC_SKATER, "s");
  out.goalies=readBlock(gc, gc>pc?logStart:(pc>gc?pc:logStart), ["gp","min","saves","ga","svpct","so","w","l"], SPEC_GOALIE, "g");
  out.skaters.forEach(function(s){
    if(s.pts===null && (s.g!==null||s.a!==null)) s.pts=(s.g||0)+(s.a||0);
  });
  // Points, then goals, then the lower number: the same order a program prints.
  out.skaters.sort(function(x,y){
    if((y.pts||0)!==(x.pts||0)) return (y.pts||0)-(x.pts||0);
    if((y.g||0)!==(x.g||0)) return (y.g||0)-(x.g||0);
    return (x.no||999)-(y.no||999);
  });
  // GAA is figured here from two totals the sheet already has, GA and
  // minutes, per 60 the standard way. That keeps the page right whether the
  // sheet's fifth goalie column still says SV% (older tabs) or GAA.
  out.goalies.forEach(function(g){
    if(g.min>0 && g.ga!==null && g.ga!==undefined) g.gaa=Math.round(g.ga*60/g.min*100)/100;
    else if(g.gaa===undefined) g.gaa=null;
  });
  out.goalies.sort(function(x,y){
    if((y.gp||0)!==(x.gp||0)) return (y.gp||0)-(x.gp||0);
    return (x.no||999)-(y.no||999);
  });
  if(!out.skaters.length && !out.goalies.length){
    state.statsNote="header row found but no player rows under it";
    return null;
  }
  state.statsNote="";
  log("stats: "+out.skaters.length+" skaters, "+out.goalies.length+" goalies");
  return out;
}

export { shapeStats, shortName };
