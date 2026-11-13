# Manual tests for v0.4.0 (Quality mode and the shortcut fix)

Run on the installer from the draft release, on a clean Windows user profile if you can. "Quality mode" is off in a fresh install; every test that needs it says so. Record the machine (processor, RAM) next to the speed results.

## A. Shortcuts inside Owl-L's own windows

1. Main window, Text tab, click into the left text box and type a few words. Press **Ctrl+Shift+L** (live captions): the region overlay appears. Press Esc. Press **Ctrl+Shift+O** (capture): the overlay appears. Press Esc.
2. Settings, Keyboard shortcuts: change live captions to the double press **Ctrl+L, L** (tick "Press twice"). Back in the Text tab with the cursor in the text box, press Ctrl+L twice quickly: live captions start (once, not started and stopped). One slow press does nothing.
3. With the cursor in the text box: Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+Z, Ctrl+Y and normal typing (also capital letters with Shift) still work. Ctrl+C twice with text selected opens quick access with that text (popup or main window, as set in Settings).
4. Same in the quick popup (type in its text box) and in the Write tab.
5. Settings, Keyboard shortcuts, open the dialog for a shortcut and press keys: they are recorded, nothing fires behind the dialog.
6. With a German keyboard layout: AltGr+Q types "@" in the text box and starts nothing.
7. Press a shortcut in another program (a browser): it still works, and runs once (no double start).

## B. Quality mode: setup

8. Settings has a **Quality mode** page. Off by default. In Task Manager, Owl-L's memory does not change when you open that page with Quality mode off, and there is no `llama-server.exe` process.
9. Switch Quality mode on, choose **Built-in**. Download the runtime (about 25 MB) and the **Small** model. Progress bars move; Cancel works and a restart resumes. After "Installed" the status says **Ready** and "The model is not loaded".
10. Disconnect the network. Everything below keeps working (the downloads were the only network use).
11. The page shows the RAM the model needs, the RAM of this computer and the free RAM. On a computer with less than 16 GB a warning shows. With most of the memory taken by other programs (open a few large apps), the page says there is not enough free memory and translating still gives the fast translation, with no crash.
12. **Ollama**: install Ollama (not part of Owl-L) and pull any small model, e.g. `ollama pull qwen3:4b-instruct`. Choose "Ollama on this computer": it is found, the model list shows, pick one. Stop Ollama: the page says it is not running. In `settings.json` set `ollamaEndpoint` to `192.168.1.5:11434`: Owl-L refuses it ("not a local address") and nothing is sent.

## C. Polish pass

13. Text tab, English to German, type "I'm astonished that nobody told me about the change." The fast translation appears at once; about 1 to 3 seconds after you stop typing (plus the model load the first time, up to a minute on a slow disk) the text changes quietly and a **Polished** marker appears. "Fast version" shows the quick translation, "Polished version" brings it back.
14. A long text with several sentences is polished sentence by sentence (the text changes a sentence at a time). Typing again cancels the running polish.
15. With the memory fully used (test 11) or the runtime stopped from Task Manager: the fast translation stays and a small "Not polished" note appears.
16. After the idle time set on the page (try 1 minute) `llama-server.exe` disappears from Task Manager and its memory is freed. The next request loads it again.
17. Quit Owl-L: `llama-server.exe` is gone.

## D. Tone

18. Next to the target language there is a **Tone** picker for German, French, Spanish, Italian, Russian, Turkish, Japanese, Hindi, Urdu (not for English, Chinese, Arabic). With Quality mode off it is visible but disabled, with the hint "Needs Quality mode".
19. English to German, "Could you tell me where you live?": Formal gives "Sie ...", Informal gives "du ...". Same for French vous/tu, Spanish usted/tú, Russian Вы/ты.
20. The picker also shows in the quick popup, the Files tab and the editor.

## E. Glossary with grammar

21. Glossary: add `owl -> Eule` for English to German and switch it on. Translate "The owls sleep during the day." With Quality mode on the polished text has **Eulen** (plural); the term is highlighted. Turn the model off (or let the answer be rejected): the old behavior ("Eule") is back.

## F. Alternatives

22. With Quality mode on, click a word in the translation: the list comes from the model; unnatural entries such as "mich" after "Ich bin" are gone. Choosing one replaces that word. With Quality mode off the list is the old one.

## G. Documents

23. Files tab: tick **Polish with Quality mode**, translate a short .docx. The progress bar moves more slowly; Cancel stops it; the result opens with the polished text and the layout is unchanged.
24. In the editor: **Polish this segment** on one row, **Polish all** with its progress and Cancel. Undo restores the previous text.

## H. Write tab

25. Write tab with Quality mode off: it explains what it needs and has a button to the settings.
26. On: paste "Yesterday me and him goes to the shop and buyed three apple." and press **Fix grammar**. Changes are marked word by word (old struck through, new highlighted). Click a change to undo or accept it; **Accept all**, **Undo all** and **Use this text** work. Try Improve, Shorter, More formal, More casual and with a German and a Japanese text.
27. Cancel while it works.

## I. Live captions

28. Live captions, Calm speed, with "Polish live captions too" on: captions appear as fast as before; after the first line (which warms the model up) polished lines replace fast ones when the model answers within 2.5 seconds. With Normal or Fast speed nothing changes.

## J. Speed (record the numbers)

29. Small model: time from stopping typing to the first polished sentence for a 10 word sentence (target: about 3 seconds on an i5, 16 GB, no GPU, when the model is already loaded). Cold start (model not loaded): ______ s.
30. Better model: same sentence: ______ s. Memory in Task Manager while loaded: Small ______ GB, Better ______ GB.

## K. Fixes after the first round of testing

**Quality mode page**

31. Quality mode on, Built-in: the status line says "Not set up: download a model below" and never asks for the engine. The engine (llama.cpp) is a small "Engine" line with its state, not a step of its own. The first model's button says "Download (1.1 GB + 25 MB engine)" and downloads both, engine first; the second model's button has no engine part.
32. During a download the model row shows a bar and "37% · 420 MB / 1.1 GB · 2.1 MB/s · 5 min left". Close the settings window and open it again during the download: the same progress is there at once. Cancel works. The status line says "Downloading… 37%".
33. After the download: "Ready"; on the first polish "Loading model…" (also in the result pane's footer), then "Loaded". After the idle time (set it to 1 minute) the status goes back to "Ready" (not an error).
34. Tier names: Hy-MT2 "Recommended", Index-Translate "Alternative", Phi-4 mini "For writing" (a separate row without a round button). One line under the list explains which model polishing and the Write tab use. Each model has one description line plus "size / memory"; "More" opens the details and the license.
35. Engine "Ollama on this computer" with Ollama not installed or not running: the page says so and has a "Use Built-in instead" button that switches the engine. With Ollama running but no model chosen: "Not set up: choose one of your Ollama models".
36. The "Free the memory after" list and the OCR "Add language" list are our own dropdowns, not the browser's.

**Model lifecycle**

37. Polish once, wait for the idle unload (`llama-server.exe` gone from Task Manager), type a new sentence: the model loads again ("Loading model…") and the sentence is polished. With the memory full (open large programs), the result pane shows a note "Quality mode could not polish this translation. Not enough free memory for the model … Close other programs …" with "Try again", not silence.

**Tone**

38. English to German, source `my name is ali and i work as software developer`: Automatic, Formal and Informal all give `Mein Name ist Ali und ich arbeite als Softwareentwickler` (first person, a statement, no change of person). `Could you tell me where you live?` still gives Sie (Formal) and du (Informal). A text without "you" and an imperative ("Please send me the invoice.") are not made a question or a different speaker.

**Swap**

39. Type English text, wait for the (polished) German result, press swap: the pickers read German → English, the German text (the polished one) is in the source pane, the result is English, and the sentence alternatives are not the old German ones. Repeat with Quality mode off. Change the tone and press swap at once: the pickers still end up flipped.

**Alternatives and state**

40. Quality mode on: click a sentence of the result: the sentence alternatives come from the model, in the chosen tone, with the glossary, without typos or lowercase starts; when the model has nothing good they are hidden. Quality mode off: the old list.
41. With Quality mode working, the tone picker is enabled in the Text tab, the quick popup, the Files tab and the editor, and the result shows "Polished". With Quality mode off or not set up, the tone picker shows a small lock with a tooltip ("Quality mode"); clicking it opens the Quality mode settings. "Fast version" in the footer shows the quick translation and a marker says so.

**Write tab**

42. Writing model not installed: the Write tab works with the translation model and shows "For better rewriting, download the writing model" with a button. After the download, Fix grammar on `Yesterday me and him goes to the shop and buyed three apple.` gives `Yesterday, he and I went to the shop and bought three apples.`; More formal does not turn "him" into "the individual".

**Meeting captions (Teams, Zoom, Meet)**

43. Settings, Files & translation, Live captions: "Meeting captions" Automatic / Always / Never. Open a Teams meeting with live captions (or play a recording) and start live captions on the caption area. The speaker name appears as a label in front of the translated line ("Name  translated text"), never inside the sentence; avatar initials never appear. The translated line grows while the person speaks, without waiting for the sentence to end. When another person speaks, a new line starts.
44. Copy all, Export and a saved session contain "Name: translated text".
45. Calm, Normal and Fast: the translation follows the speaker; note how long after a new word appears the translation changes (measured with synthetic captions: Fast about 0.3 s, Normal about 0.5 s, Calm about 0.5 s).
46. With "Polish live captions too" on: a finished utterance (the speaker changed or paused) is replaced quietly by its polished translation when the model is loaded and keeps up; the first utterance only loads the model.
47. Plain subtitles (a film) with Meeting captions on Automatic behave as before (lines appear when stable).

## L. Second round of fixes

**No loops (the fast engine)**

48. English to German, source `hi how are you ? i m softwar devllper`: the result never shows a run of letters ("n n n n ..."). Without Quality mode the fast translation is a plain (poor) one or the part before a loop. `llama-server.exe` is not running for this test. If a sentence could not be translated cleanly twice, a small note says "Couldn't translate this sentence cleanly."
49. Type the same sentence twice in a row and a longer garbled text: no loop in the result, the app stays responsive.

**Which model counts**

50. Remove every model, then install only Phi-4 mini ("For writing"): the status says "Ready" (not "Not set up"), the round button is on Phi-4 mini, a note says the chosen model is not installed and Phi-4 mini is used, the Write tab works, the tone picker is not locked, and translating starts `llama-server.exe` ("Loading model…").
51. With only Phi-4 mini: translate into Arabic, Turkish, Urdu or Hindi: the fast translation is shown with the note "The model in use does not write this language well". Into German it is polished (it translates less well than the recommended model; the row says so).
52. Install Hy-MT2 as well: the chosen model is used for polishing, Phi-4 mini for the Write tab. Choose Phi-4 mini with its round button: polishing uses it.

**Write tab**

53. Fix grammar on `Yesterday me and him goes to the shop and buyed three apple.` gives `Yesterday he and I went to the shop and bought three apples.` The result footer shows the model that made it ("Phi-4 mini"). With the writing model not installed, the footer shows the translation model and the offer to download the writing model is visible.

**Caption bar and the main window**

54. Main window open, start live captions with the shortcut and draw the region: the main window steps aside. Close the bar with its button, with Esc, and with the shortcut: the main window comes back to the front each time. Close the main window to the tray first, then do the same: it stays in the tray.

**Understanding messy input**

55. Quality mode on, English to German: `hi how are you ? i m softwar devllper` gives something like `Hallo, wie geht's? Ich bin Softwareentwickler.` and `im ali and i work as softwar devloper` gives something like `Ich heiße Ali und arbeite als Softwareentwickler.` Nothing is added that is not in the text.
56. Same with Formal and Informal: still first person, still statements. A garbled sentence that the fast engine could not translate cleanly is still polished from the source.
57. Meeting captions: a speech-recognition slip (a wrong or missing word) in a finished utterance is translated by its likely meaning after the polish.
58. Quality mode off, a Dictionaries pack of the source language installed (Settings, Language packs): type `hi how are you ? i m softwar devloper`: above the source text "Did you mean: software developer?" with "Use this". Clicking it replaces the text (undo brings the old one back). No suggestion for names (`Softwar Corp`), numbers, links, e-mail addresses, words with capitals inside, very short words, or when no dictionary of that language is installed. With Quality mode on the suggestion is not shown.
59. Polished latency for a short sentence (model loaded): note the time with the old and new approach (measured here with Hy-MT2: about 0.95 s before, 0.8 s after).

## M. Third round of fixes

**Short texts in the Write tab**

60. Write tab (Quality mode on, Phi-4 mini installed), text `i and me go zoo`: **Fix grammar** gives `He and I go to the zoo.`; **Improve** and **More formal** also give an answer (never "could not be used"). The button of the action that was pressed stays marked, also when it failed, and until the text changes.
61. When an answer is not used (try a text where the model makes something much longer), the message says what went wrong ("much longer than your text", "another language", "changed the meaning", "repeated itself") and that the same text gives the same answer, with no "Try again". When the model could not run (memory), the message says so and retrying makes sense.

**Glossary sentences keep the marker and the highlight**

62. Glossary `owl → Eule` switched on: `The owls are hunting in the forest at night.` and `The owls are sleeping in the barn.`: the result says **Polished**, has the **Fast version** button, and "Eulen" is highlighted with the glossary tooltip. The same with Hy-MT2 and with Phi-4 mini chosen. A sentence without a term shows the marker too. The quick popup shows the marker as well.

**Fix grammar changes nothing but the mistake**

63. `The owls is sleeping in the barn.` gives `The owls are sleeping in the barn.` (the plural stays). `Yesterday me and him goes to the shop and buyed three apple.` still gives `Yesterday he and I went to the shop and bought three apples.` (a numeral forces the plural, so that change is right).

**Write tab footer**

64. The footer shows `1 of 1 changes accepted · English · Phi-4 mini` as one muted line on the left and Accept all / Undo all / Use this text on the right. Make the window narrow: the line wraps above the buttons instead of squeezing.

**Sentence alternatives keep the whole meaning**

65. `im ali and i work as softwar devloper`: no alternative drops "Ali" or the "I am" part (`Ich arbeite als Softwareentwickler` is not offered); alternatives that change the name or add a lot are not offered either.

## N. English source clean-up

66. Fast mode (Quality mode off), text tab, English to German: `im ali and i work as softwar devloper` gives `Ich bin Ali und ich arbeite als ...` (not `Im Ali ...`). The text in the input box stays exactly as typed.
67. The same with Quality mode on: the result says Polished and starts with `Ich bin Ali` (or `Ich heiße Ali`), never `Im Ali`.
68. `i dont know what u mean` gives a normal translation ("Ich weiß nicht, was du meinst"). Same in the quick popup, in a document and in live captions.
69. Must stay as typed: German to English `Im Wald`; `Im Chang-min`; an `IM` abbreviation; a URL such as `www.example.com/u/im`; code in backticks; a glossary term such as `dont panic` (the term is replaced by its translation as before).
