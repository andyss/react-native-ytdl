this.cache = new Map();
import util from "./util";

const getTokens = (html5playerfile, options, callback) => {
  let key, cachedTokens;
  const rs = /(?:html5)?player[-_]([a-zA-Z0-9\-_]+)(?:\.js|\/)/.exec(
    html5playerfile
  );
  if (rs) {
    key = rs[1];
    cachedTokens = this.cache.get(key);
  } else {
    console.warn("Could not extract html5player key:", html5playerfile);
  }
  if (cachedTokens) {
    callback(null, cachedTokens);
  } else {
    fetch(html5playerfile)
      .then(body => body.text())
      .then(body => {
        const tokens = extractActions(body);
        if (key && (!tokens || !tokens.length)) {
          callback(Error("Could not extract signature deciphering actions"));
          return;
        }

        this.cache.set(key, tokens);
        callback(null, tokens);
      })
      .catch(err => {
        callback(err);
      });
  }
};

/**
 * Decipher a signature based on action tokens.
 *
 * @param {Array.<string>} tokens
 * @param {string} sig
 * @return {string}
 */
const decipher = (tokens, sig) => {
  sig = sig.split("");
  for (let i = 0, len = tokens.length; i < len; i++) {
    let token = tokens[i],
      pos;
    switch (token[0]) {
      case "r":
        sig = sig.reverse();
        break;
      case "w":
        pos = ~~token.slice(1);
        sig = swapHeadAndPosition(sig, pos);
        break;
      case "s":
        pos = ~~token.slice(1);
        sig = sig.slice(pos);
        break;
      case "p":
        pos = ~~token.slice(1);
        sig.splice(0, pos);
        break;
    }
  }
  return sig.join("");
};
/**
 * Swaps the first element of an array with one of given position.
 *
 * @param {Array.<Object>} arr
 * @param {number} position
 * @return {Array.<Object>}
 */
const swapHeadAndPosition = (arr, position) => {
  const first = arr[0];
  arr[0] = arr[position % arr.length];
  arr[position] = first;
  return arr;
};

const jsVarStr = "[a-zA-Z_\\$][a-zA-Z_0-9]*";
const jsSingleQuoteStr = `'[^'\\\\]*(:?\\\\[\\s\\S][^'\\\\]*)*'`;
const jsDoubleQuoteStr = `"[^"\\\\]*(:?\\\\[\\s\\S][^"\\\\]*)*"`;
const jsQuoteStr = `(?:${jsSingleQuoteStr}|${jsDoubleQuoteStr})`;
const jsKeyStr = `(?:${jsVarStr}|${jsQuoteStr})`;
const jsPropStr = `(?:\\.${jsVarStr}|\\[${jsQuoteStr}\\])`;
const jsEmptyStr = `(?:''|"")`;
const reverseStr =
  ":function\\(a\\)\\{" + "(?:return )?a\\.reverse\\(\\)" + "\\}";
const sliceStr = ":function\\(a,b\\)\\{" + "return a\\.slice\\(b\\)" + "\\}";
const spliceStr = ":function\\(a,b\\)\\{" + "a\\.splice\\(0,b\\)" + "\\}";
const swapStr =
  ":function\\(a,b\\)\\{" +
  "var c=a\\[0\\];a\\[0\\]=a\\[b(?:%a\\.length)?\\];a\\[b(?:%a\\.length)?\\]=c(?:;return a)?" +
  "\\}";
const actionsObjRegexp = new RegExp(
  `var (${jsVarStr})=\\{((?:(?:` +
    jsKeyStr +
    reverseStr +
    "|" +
    jsKeyStr +
    sliceStr +
    "|" +
    jsKeyStr +
    spliceStr +
    "|" +
    jsKeyStr +
    swapStr +
    "),?\\r?\\n?)+)\\};"
);
const actionsFuncRegexp = new RegExp(
  `function(?: ${jsVarStr})?\\(a\\)\\{` +
    `a=a\\.split\\(${jsEmptyStr}\\);\\s*` +
    `((?:(?:a=)?${jsVarStr}` +
    jsPropStr +
    "\\(a,\\d+\\);)+)" +
    `return a\\.join\\(${jsEmptyStr}\\)` +
    "\\}"
);
const reverseRegexp = new RegExp(`(?:^|,)(${jsKeyStr})${reverseStr}`, "m");
const sliceRegexp = new RegExp(`(?:^|,)(${jsKeyStr})${sliceStr}`, "m");
const spliceRegexp = new RegExp(`(?:^|,)(${jsKeyStr})${spliceStr}`, "m");
const swapRegexp = new RegExp(`(?:^|,)(${jsKeyStr})${swapStr}`, "m");

/**
 * Extracts the actions that should be taken to decipher a signature.
 *
 * This searches for a function that performs string manipulations on
 * the signature. We already know what the 3 possible changes to a signature
 * are in order to decipher it. There is
 *
 * * Reversing the string.
 * * Removing a number of characters from the beginning.
 * * Swapping the first character with another position.
 *
 * Note, `Array#slice()` used to be used instead of `Array#splice()`,
 * it's kept in case we encounter any older html5player files.
 *
 * After retrieving the function that does this, we can see what actions
 * it takes on a signature.
 *
 * @param {string} body
 * @return {Array.<string>}
 */
const extractActions = body => {
  const objResult = actionsObjRegexp.exec(body);
  const funcResult = actionsFuncRegexp.exec(body);
  if (!objResult || !funcResult) {
    return null;
  }

  const obj = objResult[1].replace(/\$/g, "\\$");
  const objBody = objResult[2].replace(/\$/g, "\\$");
  const funcBody = funcResult[1].replace(/\$/g, "\\$");

  let result = reverseRegexp.exec(objBody);
  const reverseKey =
    result && result[1].replace(/\$/g, "\\$").replace(/\$|^'|^"|'$|"$/g, "");
  result = sliceRegexp.exec(objBody);
  const sliceKey =
    result && result[1].replace(/\$/g, "\\$").replace(/\$|^'|^"|'$|"$/g, "");
  result = spliceRegexp.exec(objBody);
  const spliceKey =
    result && result[1].replace(/\$/g, "\\$").replace(/\$|^'|^"|'$|"$/g, "");
  result = swapRegexp.exec(objBody);
  const swapKey =
    result && result[1].replace(/\$/g, "\\$").replace(/\$|^'|^"|'$|"$/g, "");

  const keys = `(${[reverseKey, sliceKey, spliceKey, swapKey].join("|")})`;
  const myreg =
    "(?:a=)?" +
    obj +
    `(?:\\.${keys}|\\['${keys}'\\]|\\["${keys}"\\])` +
    "\\(a,(\\d+)\\)";
  const tokenizeRegexp = new RegExp(myreg, "g");
  const tokens = [];
  while ((result = tokenizeRegexp.exec(funcBody)) !== null) {
    let key = result[1] || result[2] || result[3];
    switch (key) {
      case swapKey:
        tokens.push("w" + result[4]);
        break;
      case reverseKey:
        tokens.push("r");
        break;
      case sliceKey:
        tokens.push("s" + result[4]);
        break;
      case spliceKey:
        tokens.push("p" + result[4]);
        break;
    }
  }
  return tokens;
};

/**
 * @param {Object} format
 * @param {string} sig
 * @param {boolean} debug
 */
const setDownloadURL = (format, sig, debug) => {
  let decodedUrl;
  if (format.url) {
    decodedUrl = format.url;
  } else {
    if (debug) {
      console.warn("Download url not found for itag " + format.itag);
    }
    return;
  }

  try {
    decodedUrl = decodeURIComponent(decodedUrl);
  } catch (err) {
    if (debug) {
      console.warn("Could not decode url: " + err.message);
    }
    return;
  }

  // Make some adjustments to the final url.

  // Deleting the `search` part is necessary otherwise changes to
  // `query` won't reflect when running `url.format()`
  decodedUrl = util.removeURLParameter(decodedUrl, "search");

  // This is needed for a speedier download.
  // See https://github.com/fent/node-ytdl-core/issues/127
  decodedUrl = util.changeURLParameter(decodedUrl, "ratebypass", "yes");

  if (sig) {
    if (format.sp) {
      decodedUrl = util.changeURLParameter(decodedUrl, format.sp, sig);
    } else {
      decodedUrl = util.changeURLParameter(decodedUrl, "signature", sig);
    }
  }

  format.url = decodedUrl;
};

/**
 * Applies `sig.decipher()` to all format URL's.
 *
 * @param {Array.<Object>} formats
 * @param {Array.<string>} tokens
 * @param {boolean} debug
 */
const decipherFormats = (formats, tokens, debug) => {
  formats.forEach(format => {
    const sig = tokens && format.s ? decipher(tokens, format.s) : null;
    setDownloadURL(format, sig, debug);
  });
};
let sig = {
  getTokens,
  decipher,
  swapHeadAndPosition,
  extractActions,
  setDownloadURL,
  decipherFormats
};

export default sig;
