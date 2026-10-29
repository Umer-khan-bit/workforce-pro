/**
 * Which questions must keep their original option order. An option such as "All of the above" or "Both A and B" only
 * makes sense in its place, so a question with any such option is never shuffled. The phrases come from Settings > Tests >
 * Integrity (one per line). Inside a phrase, {key} stands for one option letter (an upper-case A to Z on its own), so
 * "both {key} and {key}" catches "Both A and B". Everything else in a phrase is matched ignoring upper/lower case.
 */

/** The phrases from the setting: one per line, blanks and repeats dropped. */
export function parsePhrases(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
}

const escape = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A regular expression for one phrase: letters match either case, spaces match any run of spaces, {key} matches a capital letter. */
function phraseRegex(phrase: string): RegExp {
  const body = phrase
    .split(/(\{key\})/)
    .map((part) => {
      if (part === "{key}") return "[A-Z]";
      return [...part].map((ch) => (/\s/.test(ch) ? "\\s+" : /[a-z]/i.test(ch) ? `[${ch.toLowerCase()}${ch.toUpperCase()}]` : escape(ch))).join("");
    })
    .join("");
  return new RegExp(`(?<![A-Za-z])${body}(?![A-Za-z])`);
}

/** True when any option's text refers to the other options, so the question must keep its order. */
export function refersToOtherOptions(options: { key: string; text: string }[], phrases: string[]): boolean {
  const patterns = phrases.map(phraseRegex);
  return options.some((o) => patterns.some((p) => p.test(o.text)));
}

/** Whether a question's options may be shuffled for a candidate. */
export function mayShuffle(options: { key: string; text: string }[], phrases: string[]): boolean {
  return options.length > 1 && !refersToOtherOptions(options, phrases);
}
