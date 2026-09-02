/* The Schedule tab -> game objects, plus every warning a manager needs.

Each warning names the sheet row and says what to type. The guards here are
the reason a broken sheet shows a banner instead of a table of zeros. */
import { played } from "../model/game.js";
import { log, state } from "../state.js";
import { locateHeader, recoverByPosition } from "../util/csv.js";
import { parseDate, todayISO } from "../util/dates.js";
import { bare, clean, nearestName, norm, num } from "../util/text.js";

var COLNAME={date:"Date", time:"Face-off", away:"Away team", home:"Home team",
  as:"Away goals", hs:"Home goals", rink:"Rink", pool:"Pool / division", type:"Game type", event:"Event"};
function colLetter(n){ var s=""; n=n+1; while(n>0){ var m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; }
var SPEC_SCHEDULE = {
  date:["date","gamedate"],
  time:["faceoff","faceofftime","time","start","starttime"],
  away:["awayteam","away","visitor","visitingteam"],
  home:["hometeam","home"],
  as:["awaygoals","awayscore","awaygf","ag","goalsaway"],
  hs:["homegoals","homescore","homegf","hg","goalshome"],
  rink:["rink","location","venue","arena","sheet"],
  pool:["pooldivision","pool","division","group","bracketpool"],
  type:["gametype","type","round"],
  event:["event","showcase","tournament","eventname"]
};
function shapeGames(rows, teamList, alias){
  var h=locateHeader(rows,SPEC_SCHEDULE), out=[];
  if(!h){
    state.problems.push("Schedule tab: no header row found. Row 4 should read Date, Face-off, Away team, Home team, Away goals, Home goals, Rink, Pool / division, Game type, Event.");
    return out;
  }
  var width=0;
  for(var wi=0;wi<rows.length;wi++) if(rows[wi].length>width) width=rows[wi].length;
  var recovered=recoverByPosition(h.map, ["date","time","away","home","as","hs","rink","pool","type","event"], width);
  if(recovered.length){
    log("schedule: headers rebuilt by position -> "+recovered.join(", "));
    state.problems.push("Google blanked these Schedule headers because those columns hold dates or numbers: "+
      recovered.map(function(k){ return COLNAME[k]||k; }).join(", ")+
      ". The page worked out which is which from their position, so nothing is lost.");
  }

  var LABEL=COLNAME;
  var missing=[];
  ["date","away","home"].forEach(function(k){ if(h.map[k]===undefined) missing.push(LABEL[k]); });
  if(missing.length){
    state.problems.push("Schedule tab: couldn't work out which column"+(missing.length===1?" is":"s are")+" "+
      missing.join(" and ")+". No games can be read until that header row is right. Row "+(h.headerIndex+1)+
      " should read Date, Face-off, Away team, Home team, Away goals, Home goals, Rink, Pool / division, Game type, Event.");
    return out;
  }
  state.headerMap=[];
  ["date","time","away","home","as","hs","rink","pool","type","event"].forEach(function(k){
    state.headerMap.push(LABEL[k]+" = "+(h.map[k]===undefined?"not found":"column "+colLetter(h.map[k])));
  });

  var known=bare(), i, k;
  for(i=0;i<teamList.length;i++) known[norm(teamList[i])]=teamList[i];
  // an old or alternate spelling resolves to the current name
  alias=alias||bare();
  for(k in alias) if(Object.prototype.hasOwnProperty.call(alias,k)){ if(!known[k]) known[k]=alias[k]; }
  var unknown=bare(), seenKey=bare();
  var noDate=[], selfPlay=[], dupes=[], halfScore=[], eventDays=bare(), blankEvent=[];

  for(var r=h.headerIndex+1;r<rows.length;r++){
    var row=rows[r];
    var iso=parseDate(row[h.map.date]);
    var away=clean(row[h.map.away]), home=clean(row[h.map.home]);
    if(!iso && !away && !home) continue;                 // blank row
    if(!iso){ noDate.push(r+1); continue; }              // r+1 = the row number in the sheet

    // snap names onto the Teams list so casing/spacing differences don't split a team
    var aKey=norm(away), hKey=norm(home);
    if(away && known[aKey]) away=known[aKey]; else if(away) unknown[away]=1;
    if(home && known[hKey]) home=known[hKey]; else if(home) unknown[home]=1;

    var g={
      id:"r"+r, date:iso,
      time: h.map.time!==undefined?clean(row[h.map.time]):"",
      away:away, home:home,
      rink: h.map.rink!==undefined?clean(row[h.map.rink]):"",
      pool: h.map.pool!==undefined?clean(row[h.map.pool]):"",
      type: h.map.type!==undefined?clean(row[h.map.type]):"",
      event: h.map.event!==undefined?clean(row[h.map.event]):""
    };
    if(away && home && away===home){ selfPlay.push(r+1); continue; }   // would double-count one team
    var key=iso+"|"+norm(away)+"|"+norm(home)+"|"+norm(g.time);
    if(away && home){ if(seenKey[key]!==undefined){ dupes.push((r+1)+" duplicates row "+seenKey[key]); continue; } seenKey[key]=r+1; }

    var a = h.map.as!==undefined?num(row[h.map.as]):null;
    var b = h.map.hs!==undefined?num(row[h.map.hs]):null;
    if(a!==null&&b!==null){ g.as=a; g.hs=b; }
    else if(a!==null||b!==null) halfScore.push(r+1);
    // A sheet that runs a season AND a showcase always has both kinds of row,
    // so the mix itself proves nothing. What does prove something: a row with a
    // blank Event sitting on a day that belongs to an event. That is a forgotten
    // cell, and it drops the game into League play on its own.
    if(g.event) eventDays[iso]=g.event; else blankEvent.push({row:r+1, date:iso});
    out.push(g);
  }
  // Every warning names the sheet row and says what to type. "A row is wrong"
  // is useless when you are standing in a rink with fifteen rows to check.
  function rowList(a){
    if(a.length<=6) return a.join(", ");
    return a.slice(0,6).join(", ")+" and "+(a.length-6)+" more";
  }
  // Same shape every time: which rows, what is wrong, what to type instead.
  function warnRows(nums, one, many){
    if(!nums.length) return;
    state.problems.push("Schedule row"+(nums.length===1?" ":"s ")+rowList(nums)+": "+(nums.length===1?one:many));
  }
  var uk=Object.keys(unknown);
  if(uk.length){
    // A near-match almost always means a team was renamed on one tab only.
    var pairs=[];
    for(i=0;i<uk.length && pairs.length<3;i++){
      var near=nearestName(uk[i], teamList);
      if(near) pairs.push("\u201c"+uk[i]+"\u201d on the Schedule against \u201c"+near+"\u201d on the Teams tab");
    }
    if(pairs.length){
      state.problems.push("Schedule tab: "+pairs.join("; and ")+". Almost certainly the same club renamed on one tab and not the other. "+
        "Either Find-and-replace the Schedule tab, or put the old spelling in the Also known as column on the Teams tab and both will work.");
    }
    var rest=uk.filter(function(u){ return !nearestName(u, teamList); });
    if(rest.length) state.problems.push("Schedule tab: "+rest.slice(0,6).join(", ")+(rest.length>6?" and "+(rest.length-6)+" more":"")+
      " "+(rest.length===1?"is":"are")+" not on the Teams tab, so "+(rest.length===1?"that team is":"those teams are")+
      " left out of the standings. Add "+(rest.length===1?"it":"them")+" to the Teams tab, spelled the same way.");
  }
  warnRows(noDate,
    "the Date cell in column A is empty, so that game is being skipped. Type the date, like 2026-08-28.",
    "the Date cell in column A is empty, so those games are being skipped. Type the date, like 2026-08-28.");
  warnRows(selfPlay,
    "the same team is in both the Away and Home columns. Fix one of them.",
    "the same team is in both the Away and Home columns. Fix one of them.");
  warnRows(halfScore,
    "only one of the two goal columns is filled in, so that game still shows as not played. Enter both, or clear both.",
    "only one of the two goal columns is filled in, so those games still show as not played. Enter both, or clear both.");
  if(dupes.length) state.problems.push("Schedule: row "+rowList(dupes)+
    " — same date, time and teams, so only the first is counted. Delete the extra.");
  var stray=[], strayEvent="";
  blankEvent.forEach(function(b){
    if(eventDays[b.date]){ stray.push(b.row); strayEvent = strayEvent || eventDays[b.date]; }
  });
  if(stray.length) state.problems.push("Schedule row"+(stray.length===1?" ":"s ")+rowList(stray)+
    ": the Event cell is blank, but other games that day belong to "+strayEvent+
    ". "+(stray.length===1?"That game shows":"Those games show")+" under League play instead of with the event. "+
    "Type the event name into the Event column on "+(stray.length===1?"that row":"those rows")+".");
  if(out.length && (h.map.as===undefined || h.map.hs===undefined)){
    state.problems.push("Schedule tab: the Away goals / Home goals columns could not be found, so every game shows as not yet played. Check those two headers are spelled that way in row "+(h.headerIndex+1)+".");
  } else if(out.length>3 && !out.some(played)){
    // At the start of a season every game is in the future and every score is
    // legitimately blank. Only a game whose date has passed is evidence of a
    // reading problem.
    var today=todayISO(), gone=0;
    for(var pi=0;pi<out.length;pi++) if(out[pi].date < today) gone++;
    if(gone) state.problems.push(gone+" game"+(gone===1?"":"s")+" already played, but no score anywhere on the "+
      "Schedule tab. If you have entered some, the goal columns are not being read — open Setup check.");
  }
  log("games: "+out.length+", "+out.filter(played).length+" with scores"+(noDate.length?", "+noDate.length+" skipped for no date":""));
  return out;
}

export { COLNAME, shapeGames };
