/* Facts about one game: played, bracket, scrimmage, ours, sort order. */
import { state } from "../state.js";
import { timeKey } from "../util/dates.js";
import { norm } from "../util/text.js";

function played(g){ return typeof g.hs==="number" && typeof g.as==="number"; }

/* Not every game on the schedule counts toward anything. A bracket game is
   decided by the pool standings rather than feeding them, and a scrimmage
   counts toward nothing at all — putting one in a qualifying record would be
   a real error, not a cosmetic one. Clubs word the second kind differently,
   so match the words managers actually type instead of demanding one. */
var EXHIBITION_WORDS = ["exhibition","exhib","scrimmage","friendly","nonleague","nonqualifier"];
function isBracket(g){ return norm(g.type)==="bracket"; }
function isExhibition(g){
  var t=norm(g.type);
  if(!t) return false;
  for(var i=0;i<EXHIBITION_WORDS.length;i++) if(t.indexOf(EXHIBITION_WORDS[i])!==-1) return true;
  return false;
}
function isOurs(g){ var t=state.data.config.teamName; return !!t && (g.home===t||g.away===t); }

function bySlot(a,b){
  if(a.date!==b.date) return a.date<b.date?-1:1;
  return timeKey(a.time)-timeKey(b.time);
}

export { played, isBracket, isExhibition, isOurs, bySlot };
