/* Component: the sponsors block.

sponsorsHtml() -> HTML: the tiers in order, each sponsor in its own outlined
box. It sits at the foot of every view, under the scores and above the
housekeeping line, which is where the sponsor page sits in a printed game
program.

Boxes, not logos: nine logo files would need re-cropping every time a sponsor
changed, and the boxes are what the paper banner already does with them. The
tier is said three times over — by its label, by the size of the box, and by
the colour of its outline.

Folding: the header is a button. Open is the default, because the sponsors
paid to be seen; a reader who folds it away keeps it folded on that phone
only (localStorage), and the header still says how many are in there, so a
sponsor is never invisible. */
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
  var open=!!state.sponsorsOpen;
  var count=s.count+" sponsor"+(s.count===1?"":"s");

  var h='<section class="card sponsors'+(open?"":" shut")+'">'+
        '<button type="button" class="card-h sph" data-act="sponsors" aria-expanded="'+(open?"true":"false")+
        '" aria-controls="rr-sponsors"><h2>Our sponsors</h2>'+
        '<span class="eyebrow">'+(open?"Thank you":esc(count))+
        '<svg class="chev" width="11" height="7" viewBox="0 0 11 7" aria-hidden="true">'+
        '<path d="M1 1l4.5 4.5L10 1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'+
        '</span></button>';
  // The body is always in the markup so the button has something to point at;
  // `hidden` is what folds it, which keeps screen readers in step.
  h+='<div class="card-b" id="rr-sponsors"'+(open?"":" hidden")+'>';
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
