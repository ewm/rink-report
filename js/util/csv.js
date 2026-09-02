/* CSV parsing and header discovery.

parseCSV handles quoted fields and both line endings. locateHeader finds the
header row wherever it sits (title rows above it are normal) and maps field
roles to column indexes by name. recoverByPosition fills in roles whose
header Google blanked — see ARCHITECTURE.md, "Why two read routes". */
import { norm } from "./text.js";

function parseCSV(text){
  var rows=[], row=[], cur="", q=false, i=0, c, n;
  text = text.replace(/^﻿/,"");
  for(i=0;i<text.length;i++){
    c=text[i];
    if(q){
      if(c==='"'){ n=text[i+1]; if(n==='"'){cur+='"';i++;} else q=false; }
      else cur+=c;
    } else {
      if(c==='"') q=true;
      else if(c===","){ row.push(cur); cur=""; }
      else if(c==="\n"){ row.push(cur); rows.push(row); row=[]; cur=""; }
      else if(c==="\r"){ /* skip */ }
      else cur+=c;
    }
  }
  if(cur!=="" || row.length){ row.push(cur); rows.push(row); }
  return rows;
}

/* Find the header row anywhere in the sheet (tolerates title rows above it)
   and return {headerIndex, map:{field->colIndex}} */
function locateHeader(rows, spec){
  var best=null;
  for(var r=0; r<Math.min(rows.length, 25); r++){
    var map={}, hits=0;
    for(var c=0;c<rows[r].length;c++){
      var h=norm(rows[r][c]);
      if(!h) continue;
      for(var field in spec){
        if(map[field]!==undefined) continue;
        if(spec[field].indexOf(h)!==-1){ map[field]=c; hits++; break; }
      }
    }
    if(hits>(best?best.hits:0)) best={headerIndex:r, map:map, hits:hits};
  }
  return best;
}

/* Google's tab-name reader blanks a header cell whenever it decides that
   column is numeric — which is exactly what happens to "Away goals" and
   "Home goals". Rebuild those from position: roles sitting between two
   columns we DID identify must occupy the unclaimed columns between them,
   in order, and only when the counts match exactly. */
function recoverByPosition(map, canonical, width){
  var claimed={}, k, filled=[];
  for(k in map) if(Object.prototype.hasOwnProperty.call(map,k)) claimed[map[k]]=k;
  var found=[];
  canonical.forEach(function(role,i){ if(map[role]!==undefined) found.push({role:role,i:i,col:map[role]}); });
  if(!found.length) return filled;

  function fill(missing, from, to){
    if(!missing.length) return;
    var gap=[];
    for(var c=from;c<to;c++) if(claimed[c]===undefined) gap.push(c);
    if(gap.length!==missing.length) return;
    missing.forEach(function(role,n){ map[role]=gap[n]; claimed[gap[n]]=role; filled.push(role); });
  }
  // columns to the LEFT of the first thing we recognised — this is where the
  // Date header lands, and Google blanks it because the column is date-typed
  fill(canonical.slice(0, found[0].i), 0, found[0].col);
  for(var i=0;i<found.length-1;i++)
    fill(canonical.slice(found[i].i+1, found[i+1].i), found[i].col+1, found[i+1].col);
  // and anything past the last one
  var last=found[found.length-1];
  fill(canonical.slice(last.i+1), last.col+1, width);
  return filled;
}

export { parseCSV, locateHeader, recoverByPosition };
