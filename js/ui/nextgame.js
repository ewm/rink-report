/* Component: the gold next-game banner.

nextGameHtml() -> HTML. Reads state.data.games; prefers our next unplayed
game, else the next game on the schedule; a past game with no score shows
as "Waiting on a score" instead of sitting there as next all week. */
import { bySlot, isOurs, played } from "../model/game.js";
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
  }
  return h+"</div></section>";
}

export { nextGameHtml };
