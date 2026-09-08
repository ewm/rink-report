/* Component: the sponsors block.

sponsorsHtml() -> HTML: the tiers in order, each sponsor in its own outlined
box. It sits at the foot of every view, under the scores and above the
housekeeping line, which is where the sponsor page sits in a printed game
program.

Boxes, not logos: nine logo files would need re-cropping every time a sponsor
changed, and the boxes are what the paper banner already does with them. The
tier is said three times over — by its label, by the size of the box, and by
the colour of its outline. */
import { state } from "../state.js";
import { esc } from "../util/text.js";

function nameHtml(p){
  if(!p.url) return "<span>"+esc(p.name)+"</span>";
  return '<a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">'+esc(p.name)+"</a>";
}

/* The colour comes from WHICH tier this is, never from where it sits in the
   list. A team with gold and bronze sponsors and no silver would otherwise
   paint its bronze row silver. Anything that isn't one of the three gets the
   plain hairline. */
function tierClass(rank){ return rank<3 ? "sp"+rank : "spx"; }

function sponsorsHtml(){
  var s=state.data.sponsors;
  if(!s || !s.groups.length) return "";
  var h='<section class="card sponsors"><div class="card-h"><h2>Our sponsors</h2>'+
        '<span class="eyebrow">Thank you</span></div><div class="card-b">';
  s.groups.forEach(function(g){
    h+='<div class="sptier '+tierClass(g.rank)+'">';
    if(g.label) h+='<span class="sptl">'+esc(g.label)+"</span>";
    h+='<div class="sprail">'+g.list.map(nameHtml).join("")+"</div></div>";
  });
  var c=state.data.config.sponsorContact;
  if(c) h+='<p class="foot">'+esc(c)+"</p>";
  return h+"</div></section>";
}

export { sponsorsHtml, tierClass };
