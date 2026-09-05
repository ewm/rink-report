/* The Rinks tab -> rink name to street address.

Optional, like the stats tab: a sheet without it, or a rink without an
address, simply gets no Directions link. Nothing else changes. */
import { log } from "../state.js";
import { locateHeader } from "../util/csv.js";
import { bare, clean, norm } from "../util/text.js";

var SPEC_RINKS = { name:["rinkname","rink","name","arena","venue"], address:["address","streetaddress","location"], notes:["notes","note"] };

/* Returns a prototype-less map, norm(rink name) -> {name, address, notes}.
   Only rows with a name are kept; a row with a name and no address is kept
   too, so ?check can list the rinks still waiting on one. */
function shapeRinks(rows){
  var out=bare();
  if(!rows || !rows.length) return out;
  var h=locateHeader(rows,SPEC_RINKS);
  if(!h || h.map.name===undefined){ log("rinks: no 'Rink name' header found, tab ignored"); return out; }
  var n=0, withAddr=0;
  for(var r=h.headerIndex+1;r<rows.length;r++){
    var name=clean(rows[r][h.map.name]);
    if(!name) continue;
    var addr = h.map.address!==undefined ? clean(rows[r][h.map.address]) : "";
    var notes = h.map.notes!==undefined ? clean(rows[r][h.map.notes]) : "";
    out[norm(name)]={name:name, address:addr, notes:notes};
    n++; if(addr) withAddr++;
  }
  log("rinks: "+n+" ("+withAddr+" with an address)");
  return out;
}

export { shapeRinks };
