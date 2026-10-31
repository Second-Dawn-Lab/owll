# Manual tests for v0.2.1: Translate and edit

Use a Word file with headings, a table, a bold sentence and a link; a PowerPoint with notes; an Excel file with two sheets
(text cells and numbers); a PDF with text; a 300-page document (copy a long text over and over).

## Starting

1. Files tab, one English document: "Translate and edit" next to "Translate 1 document". It translates (progress bar), then the
   editor opens by itself. Nothing was written next to the original.
2. Three documents, "Translate and edit": each finished file shows "Translated, ready to edit" and an **Edit** button; Edit
   opens that file (one at a time; opening another leaves the first as a draft).
3. "Translate N documents" (the old button) still saves straight away and has no Edit button.
4. A Markdown file with "Translate and edit": it fails with a clear message; "Translate" still works for it.

## The editor

5. Original left, translation right, one row per paragraph, cell or slide text; both scroll together. Each row has a place label:
   Word "Paragraph 12" / "Header · 1"; PowerPoint "Slide 4" and "Slide 4 · Notes" (slide numbers follow the order in the
   presentation, also after you moved slides); Excel "Sheet Sales · B5"; PDF "Page 2".
6. Click a word in the translation: the alternatives popup. Pick one: the row gets an "Edited" mark and a bar at its left.
   Glossary terms are highlighted with the themed tooltip. Click a row and the whole-sentence alternatives appear under it.
7. The pencil button (or double-click) edits the text in place; Enter or leaving the field keeps it, Esc cancels. After typing in a
   segment, word alternatives for it are not offered until "Retranslate" (typed text is not what the engine made).
8. Segments with bold or italic: the original and translation show the formatting; the markers `{1}` are only visible in the
   edit field. Delete one of them: a warning says the formatting will be approximate; saving still gives a valid document.
9. "Retranslate" on an edited row asks first; on an unedited row it just translates again. Undo brings the edit back.
10. Undo and redo (buttons, or Ctrl+Z / Ctrl+Y outside a text field) walk through changes in all rows and scroll to the row.
11. Filters: All, Edited, Glossary applied, Left as they were (numbers and the like: greyed, read-only), each with a count.
12. The 300-page document: opens, scrolling stays smooth, the row count in the "All" chip is right, memory stays reasonable.

## Saving and drafts

13. "Save as...": follows the download location (and the save dialog for "Ask each time"); the file is named like `name (DE).docx`, never
    over the original; a PDF is saved as Word. Open the result in Word/PowerPoint/Excel: edits are in, formatting kept, no repair
    prompt, the untouched parts look as before.
14. "Keep the draft after saving" off: the draft is gone afterwards; on: it stays in the Drafts list.
15. Close Owl-L in the middle of an edit and start it again: "Continue editing <file>?"; Continue returns to your edits. "Not now"
    leaves the draft in the **Drafts** list of the Files tab (open, delete).
16. Move the original and open its draft: "was moved or deleted", with "Choose the file again..." (and the edits come back when it
    is the same document). Change the original's text and open its draft: it says the draft no longer fits.
17. "Discard" asks first; afterwards the draft is gone and the original is unchanged.
18. Switching tabs while editing keeps the draft; it can be continued from the Files tab.

## Dictionary

19. Text tab, English to German, nothing downloaded: click a word of the translation and choose **Dictionary** in the word menu. It says the
    German-English dictionary is not on this computer, with a **Download (12 MB)** button. Download: progress, then the entry appears
    without reopening.
20. Look up "erstaunt" (in a translation), "Häuser" and "ging": each shows the base form ("erstaunen", "Haus", "gehen") with a note
    "ging is a form of gehen", the head line (gender, plural, verb forms), the meanings and examples.
21. Double-click a word of the **source** text: the collapsible **Dictionary** panel under the two panes opens with its entry (English words
    show German translations with gender: house: Haus n). Click the panel's title to fold it; it keeps the last word.
22. A made-up word: "No entry for ..." and the closest headwords as buttons; clicking one looks it up.
23. The same panel and double-click lookup work in the document editor (original column), and the word menu's Dictionary tab works there too.
24. Settings, Language packs: a **Dictionaries** section with the pack, its size, "Installed" after the download, **Remove**, the license
    (CC BY-SA 4.0) and the credit "Wiktionary contributors ... wiktextract ... kaikki.org". About shows the same credit.
25. A language pair without a dictionary (for example French) says there is no dictionary for it yet. Offline after the download: unplug
    the network and look words up.
26. Switch the app to German: all new texts are German.
