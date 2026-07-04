/**
 * T-603 (NFR-009): asset supply-chain safety — injection scan.
 * Guides are prompts; a malicious asset could try to hijack the agent.
 * This scanner flags instruction-hijack phrasing and exfiltration commands in
 * guide/rubric content. Used on hub add, hub promote, and by `hx asset scan`.
 */

const INJECTION_PATTERNS: [RegExp, string][] = [
  [/ignore (all )?(previous|prior|above) (instructions|rules|guidance)/i, "instruction-hijack: 'ignore previous instructions'"],
  [/disregard (the )?(system|previous) (prompt|instructions)/i, "instruction-hijack: 'disregard the system prompt'"],
  [/you are no longer (bound|restricted|an? assistant)/i, "instruction-hijack: role escape"],
  [/(do not|don't) (tell|inform|mention.*to) the (user|human)/i, "deception: hide actions from the human"],
  [/reveal (your )?(system prompt|hidden instructions|secrets)/i, "exfiltration: reveal system prompt/secrets"],
  [/(upload|send|post|exfiltrate).{0,40}(\.env|secrets?|credentials?|private key)/i, "exfiltration: send secrets to remote"],
  [/curl\s+[^\n]*\|\s*(ba)?sh/i, "remote code execution: curl | sh"],
  [/rm\s+-rf\s+[/~]/, "destructive command: rm -rf on root/home"],
  [/base64\s+-d[^\n]*\|\s*(ba)?sh/i, "obfuscated execution: base64 | sh"]
];

export function scanGuideContent(content: string): string[] {
  const findings: string[] = [];
  for (const [re, label] of INJECTION_PATTERNS) {
    if (re.test(content)) findings.push(label);
  }
  return findings;
}
