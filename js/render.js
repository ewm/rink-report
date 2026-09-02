/* render(): one innerHTML write, composed from components.

   Every component is a pure function of the store: (view, data) -> HTML
   string. render() decides which components a view needs, joins them, and
   skips the DOM write entirely when nothing changed since last time. */
import { state } from "./state.js";
import { DIAG } from "./config.js";
import { buildViews, currentView, leagueView, barKeyFor, teamsInView } from "./model/views.js";
import { rulesFor, standings } from "./model/standings.js";
import { mastheadHtml } from "./ui/masthead.js";
import { nextGameHtml } from "./ui/nextgame.js";
import { viewBarHtml, showActiveTab } from "./ui/viewbar.js";
import { standingsHtml } from "./ui/standings.js";
import { resultsHtml } from "./ui/results.js";
import { eventsHtml, crumbHtml } from "./ui/events.js";
import { statsHtml } from "./ui/stats.js";
import { skeleton, problemsHtml, errorBannerHtml, statusHtml, footHtml } from "./ui/chrome.js";
import { diagHtml } from "./ui/diagnostics.js";

function render(){
  if(DIAG){ document.getElementById("app").innerHTML = diagHtml(); return; }
  var cfg=state.data.config, h="";
  var views=buildViews(), v=currentView();
  // The Stats and Events tabs have no games of their own, so the chip beside
  // the team name keeps showing the league record rather than going blank.
  var rv = (v.stats||v.events) ? leagueView(views) : v;
  var rules=rulesFor(rv);
  var st=standings(rv.games, teamsInView(rv), rv.event, rules);
  var rec=null, i;
  for(i=0;i<st.length;i++) if(st[i].team===cfg.teamName) rec=st[i];

  h+=mastheadHtml(v, rec);
  h+=errorBannerHtml();
  if(state.loading && !state.data.games.length && !state.loadError) h+=skeleton();
  else {
    h+=nextGameHtml();
    h+=viewBarHtml(views, barKeyFor(views, v));
    if(v.stats){
      h+=statsHtml();
    } else if(v.events){
      h+=eventsHtml(views);
    } else {
      // An event opened from the list has no button of its own, so say where
      // you are and give the way back.
      if(v.event && barKeyFor(views, v)==="events") h+=crumbHtml(v);
      h+=standingsHtml(v, st, rules);
      h+=resultsHtml(v);
    }
  }
  h+=statusHtml();
  h+=problemsHtml();
  h+=footHtml();
  // The two-minute poll usually finds nothing new. Rewriting identical markup
  // costs a repaint and buys nothing, so don't.
  if(h===state.lastHtml) return;
  state.lastHtml=h;
  document.getElementById("app").innerHTML=h;
  showActiveTab();
}
export { render };
