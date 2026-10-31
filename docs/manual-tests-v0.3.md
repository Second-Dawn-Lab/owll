# Manual tests for v0.3.0: live captions, more dictionaries, polish

## Live captions

1. Press **Ctrl+Shift+L** (also: main menu, tray menu "Live captions", Images tab button). The main window steps aside, the capture overlay
   appears. Draw a region around the subtitles of a **YouTube video with YouTube subtitles on** (English). A caption bar appears just below
   the region and starts showing German lines. Press the shortcut again: the bar closes.
2. A YouTube video with **burned-in subtitles** (hard subs): same result. Words appearing one by one do not make the bar flicker; a line
   appears once the sentence has settled.
3. **Teams / Zoom / Meet live captions** (turn on live captions in a call, draw the region around the caption area): scrolling lines
   are translated once each; a line that grows ("We are going" to "We are going to the market") replaces itself.
4. **Paused video**: pause the video: the bar keeps the last lines and Task Manager shows Owl-L close to 0 % (looks continue slowly, nothing is read).
   Resume: new captions appear.
5. **Moved window**: drag the video window: the bar still watches the old place and shows nothing new. Click **Change region** in the bar and
   draw again: it follows.
6. **Lock**: click the lock button: the bar no longer takes clicks (you can click the video's buttons through it). Unlock from the tray menu
   ("Unlock the caption bar"). Lock again and press the shortcut: it unlocks; a second press stops.
7. The bar is **not read by itself**: put the region so that the bar overlaps it (draw the region at the bottom of the screen, drag the bar
   over it): the bar's text never shows up as a new line. (Needs Windows 10 version 2004 or later.)
8. Bar controls: pause/resume, source/target language pickers (changing them restarts reading), history (50 lines, Copy, Export transcript to
   a .txt file), settings (opens Files & translation), close. **Esc** with the bar focused stops. Drag it by its background; resize it by its edges.
9. Settings, Files & translation, **Live captions**: update speed Calm / Normal / Fast, 1 to 3 lines, text size, opacity, "Show the original
   line", "Save live caption transcripts". The bar follows at once. With transcripts off, History gets nothing; with it on, a session adds one entry at the end.
10. **CPU check**: open Task Manager, Details tab, find Owl-L. With a static caption on screen it stays at 0 to 1 %. With a talking-head video
    and steady subtitles it stays under about 5 %. With a busy moving video behind the captions it is higher (up to about a fifth of one core);
    switch to Calm to lower it. On battery it slows itself down.
11. **DRM video** (Netflix, Prime Video in a browser with hardware DRM): the bar shows after a few seconds that the region is completely
    black and that protected video cannot be captured. Nothing is shown for a video that has subtitles between black bars.
12. A source language Windows cannot read (for example Urdu): the bar says which OCR language to install and opens Windows' language
    settings. A missing translation pack: it says which pack to download and opens Language packs.
13. **Two monitors / mixed DPI**: draw a region on the second monitor (150 % scale next to a 100 % one): the bar appears under it on the same monitor,
    with a sensible size, and is fully visible; with the region at the very bottom the bar goes above it.
14. Right-to-left output (target Arabic or Urdu): text reads right to left in the bar.

## Dictionaries

15. Settings, Language packs, **Dictionaries**: a row per language (German, French, Spanish, Italian, Russian, Chinese, Japanese, Arabic, Turkish,
    Urdu, Hindi, Punjabi, Bengali), each with size, entries and credit; thin ones show **Beta**. Download one, look a word up, remove it.
16. Look up an inflected word in each language you can read: French "chevaux" (cheval), Spanish "hablaron" (hablar), Italian "andavo" (andare),
    Russian "книги" (книга), Turkish "evlerimizde" (ev), Arabic "كتب". The entry shows the base form.
17. A pair without English: translate German to French, click a German word in the source or a French word in the translation, open Dictionary:
    the entry shows the note **Meanings in English**; if the other pack is missing, a Download button appears.
18. About and the Language packs page credit "Wiktionary contributors", CC BY-SA 4.0, wiktextract and kaikki.org.

## Polish

19. Files tab with no documents: the "Drop a document here" box is centered horizontally and vertically. Drag a file over the window: the whole
    content area lights up with a dashed outline and "Drop to add"; dropping adds the file.
