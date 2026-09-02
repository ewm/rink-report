/* Components that frame every page.

errorBannerHtml, problemsHtml, statusHtml, footHtml, skeleton -> HTML.
tickFresh() patches the "updated N ago" line in place, without a render. */
import { state } from "../state.js";
import { ago } from "../util/dates.js";
import { esc } from "../util/text.js";

function skeleton(){
  var h='<section class="card"><div class="card-b">';
  for(var i=0;i<5;i++) h+='<div class="skel" style="margin:10px 0;width:'+(60+((i*13)%35))+'%"></div>';
  return h+"</div></section>";
}

function freshText(){
  return state.fetchedAt ? "Updated "+ago(state.fetchedAt) : (state.loading ? "Loading…" : "Not loaded");
}
/* Repainting the whole page every 30 seconds to re-word one line was the
   flash people were seeing. Patch the line instead. */
function tickFresh(){
  var el=document.getElementById("rr-fresh");
  if(el) el.textContent=freshText();
}


/* The bar of manager warnings. Six, not four: with a messy sheet the later
   warnings were the ones getting hidden, and those are the ones nobody had
   noticed yet. */
function problemsHtml(){
  var p=state.problems;
  if(!p.length) return "";
  return '<div class="banner"><b>Things to fix on the sheet</b><ul>'+
     p.slice(0,6).map(function(x){ return "<li>"+esc(x)+"</li>"; }).join("")+"</ul>"+
     (p.length>6?'and '+(p.length-6)+' more — <a href="?check">Setup check</a> lists them all':"")+"</div>";
}
function errorBannerHtml(){
  if(!state.loadError) return "";
  return '<div class="banner"><b>Can’t reach the schedule right now.</b> '+esc(state.loadError)+
     (state.fetchedAt?" Showing what was here as of "+esc(ago(state.fetchedAt))+".":"")+"</div>";
}
function statusHtml(){
  return '<div class="status"><span id="rr-fresh">'+esc(freshText())+
     '</span><button type="button" data-act="refresh">Refresh</button></div>';
}
function footHtml(){
  return '<p class="foot">Scores are entered by the team after each game.<br><a href="?check">Setup check</a></p>';
}

export { skeleton, freshText, tickFresh, problemsHtml, errorBannerHtml, statusHtml, footHtml };
