/**
 * Robust JSON extraction from model text (SPEC §2.5 structured output).
 * 1. If a ```json (or bare ```) fence is present, its contents are tried first.
 * 2. Otherwise (or if that fails) the first balanced {...} that parses is returned.
 * Braces inside JSON strings are ignored while balancing. Throws SyntaxError if nothing parses.
 */
export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
  const sources = fence ? [fence[1], text] : [text];
  for (const src of sources) {
    const found = firstBalancedObject(src);
    if (found !== undefined) return found;
  }
  throw new SyntaxError("No JSON object found in model output");
}

function firstBalancedObject(s: string): unknown {
  for (let start = s.indexOf("{"); start !== -1; start = s.indexOf("{", start + 1)) {
    const end = matchingBrace(s, start);
    if (end === -1) continue;
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {
      // not valid JSON from this opening brace; try the next one
    }
  }
  return undefined;
}

/** Index of the brace closing the one at `start`, or -1 if unbalanced. */
function matchingBrace(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}
