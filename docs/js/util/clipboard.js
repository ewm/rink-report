/**
 * Copying text to the clipboard, on phones and laptops alike.
 *
 * The modern clipboard API only works on https and only from a tap, which
 * is how the page calls it. Older browsers, and some in-app browsers, lack
 * it, so a hidden text box and the old copy command are the fallback.
 */

/**
 * Copies text to the clipboard.
 *
 * @param {string} text
 * @returns {Promise<boolean>} Whether the copy worked.
 */
function copyText(text) {
  if (!text) {
    return Promise.resolve(false);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(
      function () {
        return true;
      },
      function () {
        return Promise.resolve(copyByTextarea(text));
      }
    );
  }

  return Promise.resolve(copyByTextarea(text));
}

/**
 * The fallback: select the text in an off-screen box and copy it.
 *
 * @param {string} text
 * @returns {boolean}
 */
function copyByTextarea(text) {
  var box = document.createElement("textarea");
  var done = false;

  box.value = text;
  box.setAttribute("readonly", "");
  box.style.position = "fixed";
  box.style.left = "-9999px";
  document.body.appendChild(box);
  box.select();

  try {
    done = document.execCommand("copy");
  } catch (e) {
    done = false;
  }

  document.body.removeChild(box);

  return done;
}

export { copyText };
