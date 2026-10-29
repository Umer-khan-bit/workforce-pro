# Integrity Part A: browser checklist (Roman Urdu, 8 steps)

App: http://localhost:7310 (pehle `npm run build` phir `npm run start`). Candidate: `candidate@demo.test`. Admin: `demo.admin@demo.test`. Recruiter: koi demo recruiter (Advanced plan).
Tayyari: candidate se koi test (e.g. Language ya Job skill) shuru karein, aur test chalte hue doosre tab par jaa kar **3 baar** wapas aayein (har baar surkh notice aaye). Test poora kar ke result dekh lein.

- [ ] 1. Admin login > menu mein **Integrity review** nazar aaye (Audit log ke sath). Kholein: "Waiting for review" mein wohi test dikhe: candidate ka naam, test ka naam, tareekh, **Window exits = 3**.
- [ ] 2. Admin > Settings > Tests: "Integrity: window exits that flag a test" ki value 3 hai. Isay 5 kar ke save karein: Integrity review page refresh par woh test list se ghayab ho jaye. Phir wapas 3 kar dein.
- [ ] 3. Recruiter login > Search > us candidate ka report kholein (candidate hona chahiye jo recruiter ko nazar aaye): us test ke neeche likha ho **"Integrity: 3 window exits"**, aur jin tests mein koi exit nahi unke neeche "Integrity: no concerns". "Download PDF report" mein bhi yehi lines hon. Sirf ginti dikhe, aur kuch nahi.
- [ ] 4. Admin: us test par **Clear flag** dabayein. Test "Waiting" se hat jaye. Recruiter report dobara kholein: ab "Integrity: no concerns". (Audit log mein "Integrity flag cleared" ki entry ho.)
- [ ] 5. Naya flagged test banayein (step "Tayyari" dohrayein, ya step 4 se pehle wala test). Admin: **Void result** dabayein. Test "Voided results" list mein chala jaye.
- [ ] 6. Candidate login > **My results**: us test ke liye peela notice: "This result was cancelled after a review. You can take the test again." aur "Go to the test" link. My tests mein woh test dobara foran shuru ho sakay (retake ka intezar nahi).
- [ ] 7. Void ke baad recruiter Search dobara karein: us candidate ka us test wala quartile ab filter/sort mein nahi aata. Agar candidate "Top Performer" thi aur badge isi result ki wajah se tha, to badge hat jaye (candidate > Badges) aur Audit log mein "Badge removed" ho.
- [ ] 8. Admin > Integrity review > "Voided results" mein **Undo void** dabayein. Test wapas "Waiting" mein aaye, candidate ka notice chala jaye, result dobara search/ranking mein aaye. Audit log mein "Result voided after integrity review" aur "Void undone" dono entries hon.
