/* Component: schedule and results, grouped by day.

resultsHtml(view) -> HTML. League play lists newest first once a score is
in; an event reads forward like a schedule. Honors state.filterOurs. */
import { bySlot, isBracket, isExhibition, isOurs, played } from "../model/game.js";
import { directionsFor, icsUrl, ourSeasonGames } from "../model/links.js";
import { state } from "../state.js";
import { fmtDate } from "../util/dates.js";
import { esc } from "../util/text.js";

/* Which end of the list goes on top depends on what you are looking at.
   A season is a results feed: newest first, because the game you care about
   just finished. A showcase weekend is a schedule: you read it forward, and
   nobody wants to scroll past Sunday night to find out when Friday starts.
   Deciding this per view rather than per game keeps the order from flipping
   halfway through a weekend as scores come in. */
function resultsHtml(v){
  var all=v.games.slice().sort(bySlot);
  // A results feed needs results. Before the first score of the season this is
  // a schedule, and nobody wants to scroll back from February to find opening
  // night. It flips once, the day the first game is scored.
  if(!v.event && all.some(played)) all.reverse();
  var shown=state.filterOurs?all.filter(isOurs):all;
  var h='<section class="card"><div class="card-h"><h2>Schedule &amp; results</h2>'+
    '<span class="seg"><button type="button" data-act="filter" data-v="all" aria-pressed="'+(!state.filterOurs)+'">All</button>'+
    '<button type="button" data-act="filter" data-v="ours" aria-pressed="'+state.filterOurs+'">Ours</button></span></div><div class="card-b">';
  if(!shown.length) h+='<p class="empty">Nothing here yet.</p>';
  else{
    var last=null;
    shown.forEach(function(g){
      if(g.date!==last){ if(last!==null) h+="</div>"; h+='<div class="daygroup"><div class="dayhead">'+esc(fmtDate(g.date))+"</div>"; last=g.date; }
      h+=gameRow(g);
    });
    h+="</div>";
    // Every game we still have to get to, as one calendar file. Built here in
    // the browser; nothing to publish or keep in sync.
    var mine=ourSeasonGames();
    if(mine.length) h+='<p class="foot"><a class="seasoncal" href="'+esc(icsUrl(mine))+'" download="'+esc(fileNameFor())+'">Add our remaining '+
      mine.length+' game'+(mine.length===1?"":"s")+' to your calendar</a> (.ics, opens in Apple, Google or Outlook)</p>';
  }
  return h+"</div></section>";
}
function fileNameFor(){
  var t=state.data.config.teamName||"schedule";
  return t.replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-schedule.ics";
}

function gameRow(g){
  var us=state.data.config.teamName, done=played(g);
  var aName=g.away||"TBD", hName=g.home||"TBD";
  var h='<div class="game"><div class="teams">';
  h+='<div class="side'+(done&&g.as<g.hs?" lost":"")+(us&&g.away===us?" ours":"")+'"><span class="nm">'+esc(aName)+'</span><span class="sc">'+(done?g.as:"")+"</span></div>";
  h+='<div class="side'+(done&&g.hs<g.as?" lost":"")+(us&&g.home===us?" ours":"")+'"><span class="nm">'+esc(hName)+'</span><span class="sc">'+(done?g.hs:"")+"</span></div>";
  h+='</div><div class="meta">';
  // Time and rink stay on the row after a score goes in. A finished game still
  // gets asked about — which sheet was it on, when did it start.
  if(done){
    if(us&&isOurs(g)){
      var o=g.home===us?g.hs:g.as, t=g.home===us?g.as:g.hs;
      h+='<span class="tag '+(o>t?"w":o<t?"l":"")+'">'+(o>t?"W":o<t?"L":"T")+"</span>";
    } else {
      h+='<span class="tag">FINAL</span>';
    }
    h+="<br>";
  }
  h+='<span class="tm">'+esc(g.time||"TBD")+"</span>";
  // The rink name is the directions link when the Rinks tab knows its address.
  if(g.rink){
    var dir=done?"":directionsFor(g);
    h+="<br>"+(dir?'<a class="rinklink" href="'+esc(dir)+'" target="_blank" rel="noopener">'+esc(g.rink)+"</a>":esc(g.rink));
  }
  // Say so on the row itself, in the manager's own wording, so nobody has to
  // work out why a 6-1 win did not move the record.
  if(isBracket(g)) h+='<br><span class="tag">BRACKET</span>';
  else if(isExhibition(g)) h+='<br><span class="tag">'+esc(String(g.type).toUpperCase())+'</span>';
  return h+"</div></div>";
}

export { resultsHtml };
