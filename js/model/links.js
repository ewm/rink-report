/* Links a parent taps: directions to a rink, and a game (or the whole
   season) into their phone's calendar.

   Everything here is built in the browser from data already on the page.
   No server, no calendar service, nothing to maintain. */
import { isOurs, played } from "./game.js";
import { state } from "../state.js";
import { dateObj, timeKey } from "../util/dates.js";
import { nearestName, norm } from "../util/text.js";

/* The rink row for a game, or null when the Rinks tab has no such rink.
   A Schedule rink is text, like a team name, so "Wlland JBM" against a Rinks
   row of "Welland JBM" (one letter off, seen on the live sheet) still finds
   its address. Same rule as team snapping: within two edits, never more. */
function rinkFor(g){
  var rinks=state.data.rinks;
  if(!g || !g.rink || !rinks) return null;
  var hit=rinks[norm(g.rink)];
  if(hit) return hit;
  var names=[], k;
  for(k in rinks) names.push(rinks[k].name);
  var near=nearestName(g.rink, names);
  return near ? (rinks[norm(near)]||null) : null;
}
/* A street address for a game's rink, or "" when the sheet has none. */
function rinkAddress(g){
  var r=rinkFor(g);
  return r && r.address ? r.address : "";
}
/* Apple devices open the built-in Maps app from a maps.apple.com link; a
   Google Maps link there lands on a web page asking you to install the app.
   Everyone else gets Google Maps, which works in any browser. */
function isApple(){
  try{ return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent||""); }catch(e){ return false; }
}
function directionsUrl(address){
  if(!address) return "";
  var q=encodeURIComponent(address);
  return isApple() ? "https://maps.apple.com/?daddr="+q : "https://www.google.com/maps/dir/?api=1&destination="+q;
}
/* Directions to a game's rink, or "" when the address isn't on the sheet. */
function directionsFor(g){ return directionsUrl(rinkAddress(g)); }

/* ---- calendar ---- */

var GAME_MINUTES = 90;   // a youth game with warm-up fits a 90-minute slot

function pad(n){ return (n<10?"0":"")+n; }
/* "20261113T191000" in the reader's local time (no Z, no TZID). A game in
   Buffalo is at 7:10 wherever the phone happens to be, so floating local
   time is the right thing here, and it's what every calendar app expects
   from a small league. */
function stamp(d){
  return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+"T"+pad(d.getHours())+pad(d.getMinutes())+"00";
}
function dayStamp(d){ return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate()); }
/* Start and end Date objects for a game, or null when the date is unreadable.
   allDay is true when the sheet has no face-off time. */
function gameWindow(g){
  var d=dateObj(g.date); if(!d) return null;
  var k=timeKey(g.time);
  if(k===9999){
    var next=new Date(d.getTime()); next.setDate(next.getDate()+1);
    return {start:d, end:next, allDay:true};
  }
  var s=new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(k/60), k%60);
  return {start:s, end:new Date(s.getTime()+GAME_MINUTES*60000), allDay:false};
}
/* "Wings at Southtown Stars" reads the way a parent would say it. */
function gameTitle(g){
  var us=state.data.config.teamName;
  if(us && isOurs(g)){
    var opp=g.home===us?g.away:g.home;
    return (g.home===us ? "vs " : "at ")+(opp||"TBD")+" (hockey)";
  }
  return (g.away||"TBD")+" at "+(g.home||"TBD");
}
function gameLocation(g){
  var addr=rinkAddress(g);
  if(!g.rink) return addr;
  return addr ? g.rink+", "+addr : g.rink;
}
function gameNotes(g){
  var bits=[];
  if(g.event) bits.push(g.event+(g.pool?" · "+g.pool:""));
  if(g.type && norm(g.type)!=="pool") bits.push(g.type);
  bits.push("Scores and standings: "+pageUrl());
  return bits.join("\n");
}
function pageUrl(){
  try{ return location.origin+location.pathname; }catch(e){ return ""; }
}
/* Google Calendar's "add this event" page. Floating local times, like the .ics. */
function googleCalendarUrl(g){
  var w=gameWindow(g); if(!w) return "";
  var dates = w.allDay ? dayStamp(w.start)+"/"+dayStamp(w.end) : stamp(w.start)+"/"+stamp(w.end);
  return "https://calendar.google.com/calendar/render?action=TEMPLATE"+
    "&text="+encodeURIComponent(gameTitle(g))+
    "&dates="+dates+
    "&location="+encodeURIComponent(gameLocation(g))+
    "&details="+encodeURIComponent(gameNotes(g));
}

/* iCalendar text escaping: backslash, comma, semicolon; newlines as \n. */
function icsText(s){
  return String(s==null?"":s).replace(/\\/g,"\\\\").replace(/([,;])/g,"\\$1").replace(/\r?\n/g,"\\n");
}
function vevent(g){
  var w=gameWindow(g); if(!w) return "";
  var uid=(g.id||"g")+"-"+g.date+"@rinkreport";
  var L=["BEGIN:VEVENT","UID:"+uid,"DTSTAMP:"+stamp(new Date())+"Z"];
  if(w.allDay){ L.push("DTSTART;VALUE=DATE:"+dayStamp(w.start)); L.push("DTEND;VALUE=DATE:"+dayStamp(w.end)); }
  else { L.push("DTSTART:"+stamp(w.start)); L.push("DTEND:"+stamp(w.end)); }
  L.push("SUMMARY:"+icsText(gameTitle(g)));
  var loc=gameLocation(g); if(loc) L.push("LOCATION:"+icsText(loc));
  L.push("DESCRIPTION:"+icsText(gameNotes(g)));
  L.push("END:VEVENT");
  return L.join("\r\n");
}
function icsFile(games){
  var body=games.map(vevent).filter(function(x){ return x; }).join("\r\n");
  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Rink Report//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH",body,"END:VCALENDAR"].join("\r\n")+"\r\n";
}
/* A data: URL the phone opens as a calendar file. */
function icsUrl(games){
  return "data:text/calendar;charset=utf-8,"+encodeURIComponent(icsFile(games));
}
function icsUrlFor(g){ return icsUrl([g]); }
/* Our whole schedule, unplayed games only: the ones a parent still needs to
   get to. Scrimmages stay in; they're still a drive to a rink. */
function ourSeasonGames(){
  return state.data.games.filter(function(g){ return isOurs(g) && !played(g) && g.away && g.home; });
}

export { rinkFor, rinkAddress, directionsUrl, directionsFor, gameWindow, gameTitle, gameLocation,
         googleCalendarUrl, icsFile, icsUrl, icsUrlFor, ourSeasonGames, GAME_MINUTES };
