# Performance direction: scene → character → block → audio

For agents working with Gemini 3.8 Flash TTS. This is a production guide, not a guarantee of acoustic results. Last updated 2026-11-13. Follow the user's casting and artistic instructions; preserve supplied text unless asked to edit it.

## Non-negotiable workflow
1. Read the entire scene and surrounding context. Identify stakes, relationship, emotional progression, who speaks, intended audience, language and continuity. Do not infer every sentence is neutral merely because a character is composed.
2. Cast each character using the user's intended perceived gender and vocal qualities; use the Gender filter and search, leaving Language unfiltered per user preference. Audition the actual Hindi script before committing. Keep a stable character → voice mapping; voice identity is separate from a turn's emotional delivery.
3. For each line, annotate dramatic intent and intensity, then choose a short per-block style for sustained emotion, pace, intensity, inflection and clarity. Reuse an approved baseline for the same character; adjust only when the scene warrants it. A restrained character can speak with controlled anger, not necessarily calm or shouted.
4. Expressions are optional and must be justified by a specific vocal event or pause at the point where it happens. No tag is preferable to a decorative one. Do not automatically insert breaths at start/end, every line, or because an expression menu exists. Preserve script wording. Use punctuation and turn style for ordinary emphasis; split into blocks when a delivery meaningfully changes mid-line and compare continuity.
5. Validate block order, character-to-voice, style, script and tag positions. Generate, save and verify each take before any new generation or model switch. Listen for exact words, pronunciation, emotion, identity, vocal artifacts, pauses and joins. Save decision notes and alternatives; no claim of quality without listening.

## How to read a dramatic line
- Ask: What does the speaker want? What just happened? Are they warning, pleading, accusing, threatening, persuading, narrating, or reacting? What subtext is present? Where does intensity change? How much restraint fits the character?
- Translate the answer into a concise voice direction: emotion + intensity/restraint + pace/inflection + clarity. Avoid conflicting adjectives and excessive character biography in every style field. Stable voice handles identity; short style handles this turn.
- Target a specific word with normal syntax, punctuation and a style change at a meaningful boundary if necessary. The visible 3.8 expression toolbar primarily lists vocalizations and pauses, not a verified general-purpose per-word emotion system. Do not claim <breath>, <gasp>, <shout> etc. will deterministically apply an aggressive effect to a chosen word. Google describes style as turn-level delivery and angle-bracket tags as momentary vocal events; test actual model behavior. https://ai.google.dev/gemini-api/docs/speech-generation

## Worked example: Rama–Ravana confrontation
Context: tense confrontation, stakes high; both experience anger, but character choices distinguish controlled righteous resolve from proud threatening defiance. This is one interpretive starting point, not a definitive portrayal.

Rama: “रावण, अभी भी समय है। सीता को सम्मान सहित लौटा दो और इस युद्ध को यहीं समाप्त करो।”
- Intent: firm warning and a last opportunity; emotion: restrained anger and resolve, not detached softness.
- Candidate style: “Firm, controlled anger and dignified resolve; measured pace, clear Hindi, restrained intensity.”
- Expressions: none required. A pause after the first sentence may be warranted for dramatic timing, but only audition an inline <short pause> if punctuation does not provide the intended pause.

Ravana: “राम! लंका का राजा किसी के सामने नहीं झुकता। यदि युद्ध ही तुम्हारा उत्तर है, तो रणभूमि तुम्हारी प्रतीक्षा कर रही है।”
- Intent: defiance and threat; emotion: proud anger with rising force.
- Candidate style: “Proud, threatening anger with controlled power; measured opening, firmer intensity on the challenge, clear Hindi.”
- Expressions: do not add a breath by default. If the script specifically requires a shout at “राम!”, trial <shout> near that moment and compare with an untagged take. It is a vocal event, not a guaranteed word-level aggression control. If intensity must change markedly in the middle, split at a natural sentence boundary with the same speaker and altered style, then listen to the join.

The previous test's trailing <breath> was inserted to test the button; it is not a creative recommendation. The previous Rama style was too calm for this specific interpretation; use the controlled-anger direction above. Earlier recordings should not be represented as an approved character performance.

## Narration without dialogue
Use one speaker and one block for a continuous script when the site accepts it and the delivery is continuous. Set a clear baseline style based on genre and subject: e.g. “Engaging Hindi historical documentary narration; thoughtful, serious, measured pace, clear diction, subtle emphasis on consequential ideas.” Keep text as spoken narration and omit tags unless a specific audible event/pause is justified. For a 10–20 minute script, the one-block preference remains the starting point; actual limits, truncation, pronunciation and long-form stability must be tested. If it exceeds limits or degrades, split at natural paragraph boundaries with the same voice and baseline, save each take and join in sequence; do not silently truncate.

## Scene-to-style examples
Documentary: informative, clear, measured; thriller: tense, deliberate and restrained; devotional: reverent, warm, unhurried; motivation: encouraging, confident, gradually building; facts: crisp, precise and conversational; sorrow: subdued, fragile, paced with space; argument: characterize distinct degrees of anger and restraint; podcast: responsive, conversational and natural; commercial: engaging, polished, product-appropriate. These are starting points: context overrides genre labels.

## Agent record for each turn
Record sequence, character ID, stable voice ID, intended gender presentation, source text, scene intent, baseline style, turn-specific style, optional tag plus reason and exact position, model, temperature, generated filename, review status and notes. Keep “no expression” as an explicit valid choice. Never label a take approved until a listener has reviewed it. Store a verified audio backup before another Run.
