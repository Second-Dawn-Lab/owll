# Better models for English to Urdu and Japanese (research and what was adopted)

The current Opus-MT models for these two languages (2023, `opus-mt-en-ur`, `opus-mt-en-jap`) are poor, so both are marked Beta. This compares them with two alternatives on the same 10 English sentences. Measured on an i5-9500T (6 cores, AVX2), oneDNN backend, 4 threads, beam 2, one sentence per call, int8.

| Model | License | Size on disk (int8) | RAM when loaded | Speed per sentence (median) | Covers |
|---|---|---|---|---|---|
| Current `opus-mt-en-ur` / `opus-mt-en-jap` | Apache-2.0 | about 66 MB / 59 MB | about 150 MB per direction | about 0.1-0.3 s (not timed separately) | one language each |
| `opus-mt-tc-bible-big-deu_eng_fra_por_spa-inc` | Apache-2.0 | 249 MB | 283 MB | 0.49 s | English, German, French, Portuguese, Spanish to the Indo-Aryan languages (Urdu, Hindi, ...) |
| `opus-mt-tc-bible-big-deu_eng_fra_por_spa-mul` | Apache-2.0 | 249 MB | 282 MB | 0.69 s (Urdu), 0.75 s (Japanese) | the same sources to about 1,600 languages |
| M2M-100 1.2B (`facebook/m2m100_1.2B`) | MIT | 1,260 MB | 1,337 MB | 2.2-2.3 s | any of 100 languages to any other |

NLLB was excluded (non-commercial license).

## Findings

- **No dedicated newer Helsinki model exists** for English to Urdu or Japanese (no `opus-mt-tc-big-en-ur` or `-en-ja`). The newest are the `opus-mt-tc-bible-big-*` multi-target models above (2024). The Tatoeba-Challenge models live on GitHub and were not checked.
- **Urdu:** the `-inc` model is clearly the best of the four: fluent, correct on the time and date sentence (the current model invents "February 3, 2002"), keeps "train station", and is the fastest of the new ones. `-mul` is similar but makes more word errors ("studying driving", "meeting moved to Friday"). M2M-100 is mostly fine but has some odd phrasing ("lamps", "lock/key" wording) and is about 5x slower and 5x bigger. The current model is mostly understandable on easy sentences but wrong or invented on several.
- **Japanese:** M2M-100 is the best: natural, correct sentences throughout. `-mul` is a big improvement over the current model (which produces unrelated fragments) but drops words on several sentences (for example "the lights" became "pressing the lights", "battery life" lost its verb). The current model is unusable.
- **Language tokens:** the tc-bible models need the target language (`>>urd<<`, `>>jpn<<`) as a single vocabulary token in front of the sentence. Sending it as plain text to SentencePiece splits it into pieces and the model produces garbage (this is what the first evaluation did wrong). If these models are adopted, the app's `prefix` handling must put the token in as one token; for the older Opus-MT models the plain-text prefix works.

## Recommendation

- **Urdu: switch to `opus-mt-tc-bible-big-...-inc`.** Same license, 250 MB for one direction (plus the existing `ur-en` model for the other, or a `-inc`-style X to English model), a large quality gain, and fast enough. It could probably lose its Beta badge after a closer review by a native speaker.
- **Japanese: M2M-100 1.2B gives the best quality but is 1.26 GB and about 2.2 s per sentence**, which is heavy for a "lightweight" app. If size matters, `opus-mt-tc-bible-big-...-mul` (250 MB, 0.75 s) is a big step up from the current model but still needs the Beta badge. Option: offer M2M-100 as an optional "high quality" download for Japanese only.
- Both new families need engine work: language-token handling (above), and for M2M-100 a different tokenizer and forced target-language prefix (done only in the test harness `crates/dawn-translate/tests/m2m.rs`).
- This is a small sample (10 sentences) judged by a non-native reader of Urdu and Japanese; a native speaker should confirm before switching.

## Adopted

- **Urdu, Hindi, Punjabi, Bengali:** `opus-mt-tc-bible-big-deu_eng_fra_por_spa-inc` (English, German, French, Spanish, Portuguese to these four) plus `opus-mt-tc-bible-big-inc-en` (all four to English). One shared 445 MB download for all four languages. All Beta.
- **Urdu to English:** `inc-en` beat the previous `opus-mt-ur-en` clearly on 10 sentences (sources: Urdu produced by the -inc model and by M2M-100): the old model produced "Good night! How do you sleep?", "we'll be dead at home" and "don't forget to pause" where `inc-en` was correct on nearly all.
- **Japanese:** English to Japanese uses `opus-mt-tc-bible-big-deu_eng_fra_por_spa-mul` (Beta). **Japanese to English keeps the previous `opus-mt-ja-en`**: it was more accurate than the tc-bible `-mul` model with `>>eng<<` on the same 10 sentences (the -mul model made errors such as "teaching medicine" and "they're late for work"). The no-longer-used Urdu and Japanese models were removed from the catalog.
- M2M-100 is left out for now (a later optional "High quality" pack).
