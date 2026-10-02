// Alexa rejects output speech over 8000 characters; stay well under it.
const MAX_SPEECH_CHARS = 6000;

/**
 * Turns Claude's text into something safe to hand to Alexa's `speak()`:
 * strips markdown the system prompt didn't prevent and escapes SSML.
 */
export function toSpeech(text: string): string {
  let out = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/(\*\*|__|\*|_)(\S[\s\S]*?\S|\S)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();

  if (out.length > MAX_SPEECH_CHARS) {
    const cut = out.slice(0, MAX_SPEECH_CHARS);
    const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    out = lastStop > 0 ? cut.slice(0, lastStop + 1) : cut;
  }

  return out.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
