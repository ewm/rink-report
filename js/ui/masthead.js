/* Component: the navy masthead.

mastheadHtml(view, ourStandingsRow) -> HTML: kicker, team name, record chip. */
import { state } from "../state.js";
import { esc } from "../util/text.js";

/* The line above the team name names whatever competition you are looking
   at, so the record chip beside it can't be misread. With no "our team" set
   — a tournament operator's view — the competition becomes the headline. */
function mastheadHtml(v, rec){
  var cfg=state.data.config, h='<header class="masthead">';
  if(state.logoOk) h+='<img class="crest" src="logo.png" alt="">';
  var kicker, headline, busy=state.loading;
  if(cfg.teamName){
    kicker = v.stats ? "Player stats" : v.events ? v.label : v.event ? v.label : (cfg.leagueName||(busy?"Loading":"League tracker"));
    headline = cfg.teamName;
  } else {
    kicker = busy ? "Loading" : (v.stats ? "Player stats" : v.events ? v.label : "Live standings");
    headline = v.event ? v.label : (cfg.leagueName||"Rink Report");
  }
  h+='<div class="txt"><div class="eyebrow">'+esc(kicker)+'</div>';
  h+='<h1>'+esc(headline)+'</h1></div>';
  if(rec&&rec.gp) h+='<div class="record">'+rec.w+"-"+rec.l+"-"+rec.t+" &middot; "+rec.pts+" PTS</div>";
  return h+"</header>";
}

export { mastheadHtml };
