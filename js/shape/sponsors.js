/* The Sponsors tab -> the tiered list on the back of the page.

Optional, like stats and rinks: no tab, or a tab nobody has filled in, and
the sponsors section simply doesn't appear. Nothing else on the page changes.

Columns: Sponsor / Tier / Website. Only Sponsor is required. */
import { log } from "../state.js";
import { locateHeader } from "../util/csv.js";
import { clean, norm } from "../util/text.js";

var SPEC_SPONSORS = {
  name:["sponsor","business","company","name"],
  tier:["tier","level"],
  website:["website","url","link","site"]
};

/* Gold before silver before bronze, whatever order the rows are typed in.
   A tier nobody here has heard of still shows; it just sorts after these
   three, in the order it first appears in the sheet. Rows with no tier at
   all come last, under no label. */
var KNOWN_TIERS = ["gold","silver","bronze"];

/* Only http and https reach an href. A sheet is a text box, and one pasted
   "javascript:" would otherwise become a live link on a page parents open.
   A bare domain (nobody types the scheme) is promoted to https. */
function safeUrl(s){
  var u=clean(s);
  if(!u) return "";
  if(/^https?:\/\//i.test(u)) return u;
  if(/^[a-z][a-z0-9+.-]*:/i.test(u)) return "";     // mailto:, javascript:, data: — not links here
  if(/^[\w-]+(\.[\w-]+)+([\/?#].*)?$/.test(u)) return "https://"+u;
  return "";
}

/* Returns null when there is nothing to show, so the component can bail on a
   falsy check the way the stats one does. Otherwise:
     { groups:[{label, rank, list:[{name,url}]}], count }  */
function shapeSponsors(rows){
  if(!rows || !rows.length) return null;
  var h=locateHeader(rows,SPEC_SPONSORS);
  if(!h || h.map.name===undefined){ log("sponsors: no 'Sponsor' header found, tab ignored"); return null; }

  var groups=[], byKey=Object.create(null), n=0, linked=0, extra=0;
  for(var r=h.headerIndex+1;r<rows.length;r++){
    var name=clean(rows[r][h.map.name]);
    if(!name) continue;
    var tier = h.map.tier!==undefined ? clean(rows[r][h.map.tier]) : "";
    var url  = h.map.website!==undefined ? safeUrl(rows[r][h.map.website]) : "";
    var key=norm(tier);
    var g=byKey[key];
    if(!g){
      var known=KNOWN_TIERS.indexOf(key);
      g={ label:tier, rank: key==="" ? 98 : (known===-1 ? 50+(extra++) : known), list:[] };
      byKey[key]=g; groups.push(g);
    }
    g.list.push({name:name, url:url});
    n++; if(url) linked++;
  }
  if(!n) return null;
  groups.sort(function(a,b){ return a.rank-b.rank; });
  log("sponsors: "+n+" across "+groups.length+" tier"+(groups.length===1?"":"s")+" ("+linked+" with a website)");
  return { groups:groups, count:n };
}

export { shapeSponsors, safeUrl };
