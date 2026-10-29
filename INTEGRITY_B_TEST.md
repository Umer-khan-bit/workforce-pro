# Integrity Part B: browser checklist (Roman Urdu)

App: http://localhost:7310 (pehle `npm run build` phir `npm run start`). Candidate: `candidate@demo.test`. Admin: `demo.admin@demo.test`.
Note: `candidate@demo.test` ke Language aur Job skill tests abhi baqi hain, un mein se kisi ek se (ya naye candidate se IQ) test karein.

- [ ] 1. Admin login > **Settings > Tests**. Neeche "Integrity: seconds per question" ke 5 fields (Personality, IQ, EQ, Language, Job skill) hain, sab ki value **0** (band). Har field ke neeche nila hint ho, jaise "IQ: 15 min overall, up to 22 questions, about 40 s per question".
- [ ] 2. IQ ke field mein bohat bara number (jaise 5000) likh kar "Save changes" dabayein: surkh error aaye ke time per question poore test se lamba hai, aur kuch save na ho. Phir 0 rehne dein.
- [ ] 3. Settings > Tests mein "Integrity: shuffle the answer options" = **Yes** (shuru mein). Candidate login karein, koi MCQ test (IQ/Language/Job skill) shuru karein: sawal ke options ke letters hamesha A, B, C, D upar se neeche aayen, aur text ka order har candidate/test mein badal jaye (alag candidate se dobara dekhein).
- [ ] 4. Test chalte hue ek option chun kar Next dabayein; test normal chale, score/result theek aaye. (Letter sirf screen par position dikhata hai, jawab asal option ke hisaab se check hota hai.)
- [ ] 5. Admin: Settings > Tests mein IQ ka "seconds per question" **20** karein, Save. Candidate se naya IQ test shuru karein: sawal ke upar chhota "Time for this question: 0:20" countdown ghat'ta dikhe (aakhri 10 second surkh).
- [ ] 6. Kuch jawab diye baghair countdown **0** hone dein: page khud agla sawal dikha de (test band na ho, poora test ka timer apni jagah chalta rahe). Sawal ab "unanswered" ginay jaate hain (galat ke barabar).
- [ ] 7. Naya sawal aaye to countdown dobara 0:20 se shuru. Ek sawal par browser band kar ke 10 second baad dobara test kholein (My tests > Continue): wohi sawal, countdown wahin se (reset nahi hota).
- [ ] 8. Wapas Settings mein IQ ka field **0** kar dein (band). Naya IQ test: ab koi "Time for this question" countdown nahi aata. Aur Settings > Test settings (har test ka total time) mein IQ ka time 1 minute karne ki koshish karein jabke per-question limit 20 ho: error aaye ke pehle per-question time kam karein.
