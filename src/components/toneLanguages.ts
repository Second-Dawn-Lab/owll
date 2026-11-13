// Languages where the Formal / Informal picker changes the words. Mirrors `tone_available` in dawn-llm (tone.rs).
const TONE_LANGUAGES = ["de", "fr", "es", "it", "pt", "nl", "pl", "ru", "uk", "cs", "tr", "ja", "ko", "hi", "ur"];

export function toneAvailable(language: string): boolean {
  return TONE_LANGUAGES.includes(language);
}

export type Tone = "automatic" | "formal" | "informal";

/** The tone that is sent with a request: "automatic" for a language without tones, so nothing is asked of the model. */
export function effectiveTone(language: string, tone: Tone): Tone {
  return toneAvailable(language) ? tone : "automatic";
}
