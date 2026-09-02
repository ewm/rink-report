/* Component: the competition switch under the banner.

viewBarHtml(views, activeKey) -> HTML. One button per bar view; the active
one is aria-pressed. showActiveTab() scrolls it into view after a render. */
import { esc } from "../util/text.js";

function viewBarHtml(views, curKey){
  if(views.length<2) return "";
  var h='<nav class="viewbar" aria-label="Competition">';
  views.forEach(function(v){
    h+='<button type="button" data-act="view" data-v="'+esc(v.key)+'" aria-pressed="'+(v.key===curKey)+'">'+esc(v.tab)+"</button>";
  });
  return h+"</nav>";
}

/* When the bar scrolls, the tab you are on must be the one you can see. */
function showActiveTab(){
  try{
    var b=document.querySelector('.viewbar button[aria-pressed="true"]');
    if(!b) return;
    var bar=b.parentNode;
    if(bar.scrollWidth<=bar.clientWidth) return;
    bar.scrollLeft=Math.max(0, b.offsetLeft-(bar.clientWidth-b.offsetWidth)/2);
  }catch(e){}
}

export { viewBarHtml, showActiveTab };
