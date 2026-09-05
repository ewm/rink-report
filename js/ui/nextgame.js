/* Component: the gold next-game banner.

nextGameHtml() -> HTML. Reads state.data.games; prefers our next unplayed
game, else the next game on the schedule; a past game with no score shows
as "Waiting on a score" instead of sitting there as next all week.

Under the date line sit the links a parent actually wants from this card:
directions to the rink (when the Rinks tab has its address) and two ways to
put the game in a calendar. */
import { bySlot, isOurs, played } from "../model/game.js";
import { directionsFor, googleCalendarUrl, icsUrlFor } from "../model/links.js";
import { state } from "../state.js";
import { countdownText, fmtDate, todayISO } from "../util/dates.js";
import { esc } from "../util/text.js";

function nextGameHtml(){
  var today=todayISO();
  var open=state.data.games.filter(function(g){return !played(g);}).sort(bySlot);
  var ahead=open.filter(function(g){return g.date>=today;});
  // A past game with no score would otherwise sit here as "next" all week.
  var pool=ahead.length?ahead:open, stale=!ahead.length&&open.length>0;
  var ours=pool.filter(isOurs), g=ours[0]||pool[0], us=state.data.config.teamName;
  var h='<section class="next"><div class="strip"><span class="eyebrow">'+(stale?"Waiting on a score":"Next game")+"</span>";
  if(g&&!stale) h+='<span class="countdown">'+esc(countdownText(g.date))+"</span>";
  else if(g) h+='<span class="countdown">SCORE NOT IN</span>';
  h+='</div><div class="body">';
  if(!g) h+='<p class="empty">No upcoming games on the schedule.</p>';
  else{
    if(!(g.away&&g.home)){
      h+='<div class="matchup">'+esc(g.type||"Game")+' <span class="vs">— teams TBD</span></div>';
    } else if(us&&isOurs(g)){
      var opp=g.home===us?g.away:g.home, atHome=g.home===us;
      h+='<div class="matchup">'+(atHome?"":'<span class="vs">at</span> ')+esc(opp)+(atHome?' <span class="vs">at home</span>':"")+"</div>";
    } else {
      h+='<div class="matchup">'+esc(g.away)+' <span class="vs">at</span> '+esc(g.home)+"</div>";
    }
    h+='<div class="when"><span><b>'+esc(fmtDate(g.date))+"</b></span>";
    if(g.time) h+="<span>"+esc(g.time)+"</span>";
    if(g.rink) h+="<span>"+esc(g.rink)+"</span>";
    h+="</div>";
    if(g.event) h+='<div class="evtag">'+esc(g.event)+(g.pool?" · "+esc(g.pool):"")+"</div>";
    h+=actionsHtml(g, stale);
  }
  return h+"</div></section>";
}

/* Directions and calendar links for one game. A game already waiting on a
   score gets none: nobody needs directions to last Tuesday. */
function actionsHtml(g, stale){
  if(stale) return "";
  var dir=directionsFor(g), gcal=googleCalendarUrl(g), ics=icsUrlFor(g), h="";
  if(dir) h+='<a class="act" href="'+esc(dir)+'" target="_blank" rel="noopener">Directions</a>';
  if(ics) h+='<a class="act" href="'+esc(ics)+'" download="game.ics">Add to calendar</a>';
  if(gcal) h+='<a class="act" href="'+esc(gcal)+'" target="_blank" rel="noopener">Google Calendar</a>';
  return h ? '<div class="actions">'+h+"</div>" : "";
}

export { nextGameHtml };
