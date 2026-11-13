# Speech production and voice design guide

Evidence dated 2026-11-13. Source: https://ai.google.dev/gemini-api/docs/speech-generation and https://ai.google.dev/gemini-api/docs/models. The browser UI and API can differ. Labels below are Google's descriptions, not independent listening evaluations. Voice suggestions are hypotheses to audition with the actual language and script.

## Verified UI tests
- In a new dialog, entered a short Hindi line and ran Gemini 3.8 Flash TTS with default Fola. Run switched to Stop while processing; then Play and Download became available. This confirms the UI produced an audio result, not its quality or exact pronunciation. Download was not exercised.
- Add speech block created a second block with Speaker 2 - Rami and a second Speaker settings card. Entered a second Hindi line; Ctrl+Enter ran, showed Stop, then restored Run and enabled Download. Actual speaker distinction was not independently auditioned.
- Custom style field accepted “Warm, calm storytelling with clear Hindi pronunciation and measured pacing.” The first block's Style description reflected the entry after Escape. Generation with this style and actual acoustic effect are not yet tested.
- The accessible expression toolbar provides 40 options documented in speech-interface-map.md. Insertion and sound effects remain untested.

## Model taxonomy
Official documentation lists 3.8 Flash TTS for expressive quality and 3.8 Flash-Lite TTS for speed/throughput. Both support single/multiple speakers, voice design and replication according to the current TTS guide. It also lists 3.1 Flash TTS Preview and 2.5 Pro Preview TTS with single/multiple speakers, without those voice-design/replication features. The model catalogue separately lists 2.5 Flash TTS; legacy status and account availability require checking the current model-specific documentation. Audio category also includes live audio, translation, transcription and music; do not present them as interchangeable text-to-speech models. Only 3.8 Flash TTS was actually run here; other models and availability were not tested. Do not claim a full UI model catalogue from a partial list.

## 30 curated voices
Google's labels: Zephyr—bright; Puck—upbeat; Charon—informative; Kore—firm; Fenrir—excitable; Leda—youthful; Orus—firm; Aoede—breezy; Callirrhoe—easy-going; Autonoe—bright; Enceladus—breathy; Iapetus—clear; Umbriel—easy-going; Algieba—smooth; Despina—smooth; Erinome—clear; Algenib—gravelly; Rasalgethi—informative; Laomedeia—upbeat; Achernar—soft; Alnilam—firm; Schedar—even; Gacrux—mature; Pulcherrima—forward; Achird—friendly; Zubenelgenubi—casual; Vindemiatrix—gentle; Sadachbia—lively; Sadaltager—knowledgeable; Sulafat—warm. These are not a complete library. Google documents an extended, paginated voice library; the observed UI said 'Search 2,000+ voices'. Counts differ by source and time; neither proves the exact current total. Do not infer gender or Hindi accent from names. Query/filter the current library and audition samples.

## Candidate casting and direction (starting points, not tested rankings)
| Use | Voice qualities / candidates | Short style direction |
|---|---|---|
| Ravana or imposing antagonist | Deep, textured, resonant; audition gravelly Algenib or filtered low-pitch Hindi voices | Controlled, resonant authority; slow measured pace, restrained menace |
| Rama or compassionate hero | Gentle, clear, composed; audition Vindemiatrix, Achernar or Hindi-filtered voices | Calm, compassionate and dignified; clear measured Hindi |
| Documentary / history | Clear, informative, measured; Charon, Rasalgethi, Iapetus | Clear, measured, authoritative narration; natural pauses |
| Devotional / meditation | Warm, gentle and unhurried; Sulafat, Vindemiatrix, Achernar | Warm, reverent and serene; slow natural pacing |
| Facts / education | Informative, clear; Charon, Iapetus, Erinome | Crisp, conversational explanation with deliberate emphasis |
| Motivational | Firm, warm, rising energy; Kore, Orus, Alnilam | Confident, inspiring, gradually building energy |
| Podcast | Easy-going, friendly; Callirrhoe, Achird, Umbriel | Relaxed, conversational, responsive with natural pauses |
| Commercial | Smooth, warm; Algieba, Despina, Sulafat | Polished, inviting, natural emphasis on key words |
| Thriller | Textured, controlled, soft; audition Algenib and Enceladus | Hushed, tense and deliberate; brief pauses |
| Children's story | Bright, friendly; Zephyr, Puck, Achird | Playful, clear and expressive without shouting |
| News | Even, informative; Schedar, Charon | Neutral, precise, steady pacing |
| Comedy / energetic host | Lively, upbeat; Sadachbia, Puck, Laomedeia | Bright conversational energy, playful timing |
| Training / corporate | Clear, firm, reassuring; Iapetus, Kore | Direct, supportive, measured and intelligible |
| Romance / intimate story | Warm, smooth; Sulafat, Algieba | Soft, warm and close, restrained emotion |

## Practical direction
Select or design a stable base voice first; use style for a short turn-level delivery instruction (emotion, pace, volume, inflection). A style instruction is guidance, not deterministic pitch/LUFS/EQ control; measure and post-process if exact technical levels are needed. Inline <short pause>, <sigh> or <gasp> mark momentary events. 3.8 documentation recommends vocal events rather than sound-effect tags, and advises concise styles and a plain baseline. Do not rely on long persona directions to change underlying voice identity. Older models use different prompting formats; consult their current documentation.

Audition workflow: use the same 15–30 second Hindi script for each candidate; compare pronunciation, consonant clarity, breath/noise, natural pauses, emotional range and character continuity. Change one parameter at a time and retain model, voice ID, style, text, tags and output with date. Evaluate both quiet and loud passages. For long scripts, split by meaningful dialogue turns, review joins and pronunciation, then normalize and master after synthesis. Genre suggestions above are hypotheses until A/B listening confirms them.

## Dynamic discovery design
Use an explicit user-authorized API key only if API integration is selected; never extract browser session credentials. Documented ListVoices supports pagination via next_page_token and filters for language, region, accent, perceived gender, pitch, persona, context, source and search. Keep timestamp, ID, metadata, source and availability; handle pagination, rate limits, removed/renamed entries, user-specific custom voices, and unknown fields. Model-list sync alone does not prove a model supports this specific UI or free access; capability/availability must be validated and unknowns shown. No sync code has been implemented.

## Remaining work
Full model switching and generation, sample downloads and listening, expression insertion, custom voice creation, all voice metadata, exact UI DOM/selector verification and all other browser tests remain open. No claims of complete coverage, tested sound quality, or browser compatibility should be made yet.

## Character casting and expression verification — 2026-11-13
User preference: never apply the Language filter for routine casting. Use Gender (actual labels: Masculine, Feminine, Neutral), optional name search and voice audition. Filter result is an account-specific subset, not proof of the full 2,000+ catalog. Masculine filter displayed: Arlo, Bodi, Brio, Cruz, Daro, Elio, Enzo, Finn, Gero, Jett, Knox, Koda, Ludo, Mako, Milo, Neno, Olin, Rami, Riko, Varo, Zeno, Achird, Algenib, Algieba, Alnilam, Charon, Enceladus, Fenrir, Iapetus, Orus, Puck, Rasalgethi, Sadachbia, Sadaltager, Schedar, Umbriel, Zubenelgenubi. This is the visible accessibility result for this account at this moment, not an exhaustive universal list or acoustic verification.

Verified: selecting Masculine then searching Achird selected it for Speaker 1; searching Algenib selected it for Speaker 2. UI described Achird as friendly/lower middle pitch and Algenib as gravelly/lower pitch. First block style: calm, compassionate, dignified, measured, clear Hindi. Second: deep, commanding, proud, menacing, deliberate. Clicking the visible breath chip in the expression toolbar appended <breath> at the end of first block in this test; second block contained a typed <short pause>. Generation succeeded, and downloaded file test-audio/06-ram-ravana-masculine-expressions.wav is 24.92 seconds, 24 kHz mono PCM. Neither sound quality, gender presentation by ear, expression realization, nor cursor-specific insertion behavior was independently heard or verified.

Add speech block after two speakers produced a third block assigned to existing Speaker 1 (Achird), not Speaker 3. Do not infer number of unique speakers from number of blocks. Official Gemini API documentation says a single multi-speaker request supports up to two prebuilt speakers; verify actual current UI constraints separately. For 5–10 characters, plan ordered segments with at most supported speakers per generation, consistent casting records, backup every take, and post-production assembly; preserve order and transitions. https://ai.google.dev/gemini-api/docs/speech-generation

Use one continuous block for a single continuous narrator when appropriate; use additional ordered blocks for speaker changes or meaningful delivery changes. Preserve a character's chosen voice and baseline style across turns; alter a block's style intentionally for that moment. Record explicit expression decision per block (none is valid); avoid forcing sounds onto every line. Place intentional expressions at meaningful points and audition output; tags are instructions, not guaranteed effects.

Temperature observed at 1; leave default unless the user requests controlled A/B experimentation. It affects sampling randomness, not a precise loudness or identity control; lower values do not guarantee stable voice. Google generally recommends keeping Gemini 3 parameters at defaults: https://ai.google.dev/gemini-api/docs/prompting-strategies . No temperature A/B test was performed.

Creative correction: The previous breath insertion was a UI test, not an acting recommendation. Consult performance-direction-guide.md for the scene-first workflow and the corrected Rama/Ravana directions. Avoid unnecessary vocalizations; a blank expression choice is valid. Short single-block narration generated as test-audio/07-documentary-single-block.wav with documentary style and no expression tags. The output was saved, but has not been subjectively auditioned.
