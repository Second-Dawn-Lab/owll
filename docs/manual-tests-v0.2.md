# Manual test list for the documents, alternatives, glossary and capture changes

Run on a normal Windows profile with German (and ideally Urdu or French) installed. Mark what failed and tell me what you saw.

## Documents (Files tab)

1. **Word:** a real document with a table, headings, a bulleted list and a few **bold words inside sentences**. Drop it on the window (or "Choose file"), source is detected, target German, Translate. Open the result in Word: layout, styles, table and numbering are unchanged; text is German; bold words are bold in about the right place; no repair prompt when opening. The original file is unchanged.
2. **PowerPoint:** a deck with titles, a table, speaker notes and a chart. Text and notes are translated; the chart stays English and is listed under "Left as they were".
3. **Excel:** a sheet with formulas, numbers, dates and a table with header row. Text cells translated; formulas and numbers unchanged; the table headers are kept; Excel opens it without a repair prompt.
4. **Text PDF:** translated into a Word document with one page break per page. Layout is not kept (that is stated in the summary).
5. **Scanned PDF** (a photo of a page saved as PDF): a clear message, nothing is written.
6. **Password-protected** Word file: the "password protected" message.
7. **Cancel:** translate a large document (copy a paragraph a few hundred times), press Cancel: the message says nothing was written; no `.part` file stays next to the target.
8. The app stays usable (switch tabs, translate text) while a document runs.
9. A `.txt` and a `.md` file with code blocks, links and a table: code and link targets are untouched.
10. Download location set to "Ask each time" shows a save dialog with `name (DE).ext`; with a folder set it saves there without asking; an existing file is never overwritten (a number is added).
11. Remove the German pack, drop a German document: the message offers to download the pack.
12. The document appears once in History (name only, not its text).
13. A file over 100 MB is refused with the limit stated.

## Word alternatives

14. Text tab: translate a sentence, click a word: a list of up to five words opens within about half a second (the first time takes a second longer). Choose one: the rest of the sentence changes and stays grammatical.
15. Keep typing at the end of the text: the chosen sentence stays as you chose it; change a word inside that source sentence and it is translated normally again.
16. Keyboard only: Tab to the translation, arrows between words, Enter opens, arrows choose, Enter applies, Esc closes.
17. The same in the quick popup (Ctrl+C+C), also at its smallest size (the list stays inside the window), and in the Images tab. Try Urdu output (right-to-left).

## Glossary

18. Settings, Glossary: add `owl -> Eule` (English to German), translate "The owl sleeps on the sofa.": "Eule" appears and "Glossary applied" shows. Try plural, a capital at the start, a word inside another word with "Whole word only" on and off.
19. Export CSV, delete all terms, import the file again: the terms are back. Open the CSV in Excel (semicolon files are read too).
20. The global switch and the per-term switch turn the effect off.
21. Reset all settings with and without "Also delete my glossary".
22. Translate a document containing the term: it is used there too.

## Capture

23. With the Owl-L main window in front, press Ctrl+Shift+O: the window steps aside, you draw a box, the window returns with the text in the **Text tab** and the translation next to it; the chip "From screen capture" has a "View image" button.
24. Press Esc during the capture: the window returns, nothing else changes. Do the same with the window closed to the tray, and with "Small popup" chosen in Settings, Files & translation (the popup shows; the main window comes back behind it).
25. Pick a different source language than the one used for reading: the same capture is read again without a new screenshot; the Images tab does the same for an opened file and has its own source picker.
26. Capture small text (a status bar or a 9 to 10 pixel UI): fewer misread letters than before; real words are not changed.
27. Capture an image with no text: the Images tab explains and offers to try again.

## Fixes and additions after the first test round

28. **Excel written by ClosedXML / the .NET OpenXML SDK** (your test file): drop it, translate. Text cells (including `t="str"` cells) come back translated; formulas, numbers and dates are unchanged; the file differs from the original and opens in Excel without a repair prompt. A text file with prefixed elements in Word and PowerPoint also works.
29. **Ctrl+Shift+O with the cursor in the Text tab's text box** starts the capture (also while the main window is the active window, and in the quick popup). Then check that Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z, Ctrl+Y, Ctrl+A and Ctrl+Shift+arrows still edit text normally in every text box, and that F5 and Ctrl+P no longer do anything inside Owl-L's windows (they are browser shortcuts that were switched off).
30. **Word alternatives:** "I'm astonished" -> "Ich bin erstaunt": click "erstaunt". The panel has a header "Alternatives for "erstaunt"" with a close button, two tabs (Alternatives, Dictionary: "Coming soon"), the current word first marked "current", whole words without punctuation, each with how the sentence continues, up to ten, scrollable. Try a word split into several pieces (a long compound word), a word after a comma, and Urdu output (right to left). Keyboard: arrows, Enter, Esc.
31. **Several documents:** drop three files of different types at once; each row shows its language, which you can change per file; "Translate 3 documents" runs them one after another; "Cancel all" stops the running one (nothing is written for it) and the others return to "ready"; a finished file can be opened or shown in its folder; "Add more documents" adds files to the list; each file is one History entry. With "Ask each time" as download location you are asked for one folder for several files.
32. **PDFs in a batch** are converted to Word without a question (Keep as PDF is not built yet; see documents.md).
33. **Named glossaries:** Settings, Glossary: create "My business glossary", add a term, rename, delete a list. Your earlier terms are in "My glossary". The Text tab and the Files tab have a switch with the glossary name and a list to change it; the quick popup uses the last choice and shows "Glossary applied". Switching the glossary re-translates the text.
