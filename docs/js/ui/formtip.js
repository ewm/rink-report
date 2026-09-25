/**
 * The little label that says why a player is hot, warm or cold.
 *
 * Shows on hover with a mouse and on tap with a finger. It is one element
 * on <body>, placed with fixed positioning next to the emoji, so the
 * sideways-scrolling table around the emoji cannot clip it. A render does
 * not remove it, because the page only redraws its own root.
 */

/** The label element, made on first use. */
var tip = null;

/**
 * Makes the label element the first time it is needed.
 *
 * @returns {HTMLElement}
 */
function tipEl() {
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "formtip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    document.body.appendChild(tip);
  }

  return tip;
}

/**
 * Shows the label under an emoji, kept inside the screen.
 *
 * @param {HTMLElement} el - The .form emoji.
 */
function show(el) {
  var t = tipEl();
  var box = el.getBoundingClientRect();

  t.textContent = el.getAttribute("data-why") || "";
  t.hidden = false;

  var left = box.left + box.width / 2 - t.offsetWidth / 2;
  var maxLeft = window.innerWidth - t.offsetWidth - 8;

  left = Math.max(8, Math.min(left, maxLeft));

  // Below the emoji, unless that runs off the bottom of the screen.
  var top = box.bottom + 6;

  if (top + t.offsetHeight > window.innerHeight - 8) {
    top = box.top - t.offsetHeight - 6;
  }

  t.style.left = left + "px";
  t.style.top = top + "px";
}

/** Hides the label. */
function hide() {
  if (tip) {
    tip.hidden = true;
  }
}

/**
 * The emoji an event happened on, if any.
 *
 * @param {Event} e
 * @returns {HTMLElement|null}
 */
function formOf(e) {
  return e.target && e.target.closest ? e.target.closest(".form[data-why]") : null;
}

/** Hooks the label up to the page. Call once at start-up. */
function initFormTip() {
  document.addEventListener("mouseover", function (e) {
    var el = formOf(e);

    if (el) {
      show(el);
    }
  });

  document.addEventListener("mouseout", function (e) {
    if (formOf(e)) {
      hide();
    }
  });

  // A tap on the emoji shows the label; a tap anywhere else hides it.
  // Not a toggle: a phone fires mouseover just before the click, so a
  // toggle would open and close it in the same tap.
  document.addEventListener("click", function (e) {
    var el = formOf(e);

    if (el) {
      show(el);
    } else {
      hide();
    }
  });

  document.addEventListener("focusin", function (e) {
    var el = formOf(e);

    if (el) {
      show(el);
    }
  });

  document.addEventListener("focusout", function (e) {
    if (formOf(e)) {
      hide();
    }
  });

  // The label is placed for where the emoji was, so it goes on scroll.
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}

export { initFormTip };
