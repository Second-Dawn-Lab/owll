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
