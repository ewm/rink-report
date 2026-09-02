/* The last good copy, in localStorage, so the page paints before the fetch. */
import { CACHE_KEY } from "./config.js";
import { log, state } from "./state.js";
import { ago } from "./util/dates.js";

function saveCache(){
  try{ localStorage.setItem(CACHE_KEY, JSON.stringify({at:state.fetchedAt, data:state.data, pools:state.data.pools})); }catch(e){}
}
function loadCache(){
  try{
    var raw=localStorage.getItem(CACHE_KEY); if(!raw) return false;
    var o=JSON.parse(raw);
    if(!o||!o.data) return false;
    state.data=o.data; state.data.pools=state.data.pools||{}; state.fetchedAt=o.at||null;
    log("rendered from local cache saved "+ago(state.fetchedAt));
    return true;
  }catch(e){ return false; }
}

export { saveCache, loadCache };
