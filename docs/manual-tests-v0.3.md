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
8. Bar controls: pause/resume, source/target language pickers (changing them restarts reading), Copy conversation, Export to a .txt file,
   settings (opens Files & translation), close. **Esc** with the bar focused stops. Drag it by its background; resize it by its edges.
9. Settings, Files & translation, **Live captions**: update speed Calm / Normal / Fast, lines shown at first, text size, opacity, "Show the original
   line", "Save the conversation to History" (Ask me each time / Always / Never). The bar follows at once.
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

## Shortcuts

20. Settings, Keyboard shortcuts: change the live captions shortcut to **Ctrl+L, L**: in the dialog tick "Press the key twice in a row", press Ctrl+L. It saves as
    "Ctrl+L L" and shows a warning that Ctrl+L is the address bar in browsers and that Owl-L only watches the keys, so the browser still reacts. Save anyway.
    Hold Ctrl and press L twice: live captions start. Pressing L twice slowly (more than 0.4 s apart) does nothing.
21. The same with the capture shortcut and the quick-access shortcut (any letter, single or double): all three work as a single or a double press. With the
    Settings page open, pressing a shortcut shows "Shortcut detected" next to its row: use it to try a new shortcut at once. If nothing is detected, the keys
    do not reach Owl-L (another program may take them first, or the hook could not start: the page then says so).
22. In the shortcut dialog press Ctrl+ArrowUp or Ctrl+comma: it says the key cannot be part of a shortcut. Press Ctrl+C once: warning about editing shortcuts.
    Ctrl+P, Ctrl+S, Ctrl+F, Win+L: each names what other programs use it for.
23. If a capture or live selection does not appear within about 8 seconds (for example the page did not load) it is given up, so the shortcut works again.

## Lists in their own window

24. In the caption bar open the source language picker: the list opens in a small window next to the button, fully visible even though the bar is small, with a search
    field. Type to filter, arrows and Enter to choose, Esc or a click elsewhere closes it. The bar stays in front. Near the bottom of the screen the list opens above.
25. The quick popup (Ctrl+C C on selected text): its language pickers and the "more" menu open the same way; the popup does not hide while the list is open and is
    in front again after a choice.

## Conversation in the bar

26. Let captions run for a while: the bar shows the whole session as a scrollable list (translation, optional original below, small time). While you are at the
    bottom it scrolls by itself. Scroll up: it stops, and a **Jump to latest (N new)** button counts the new lines; click it (or scroll to the bottom): it follows again.
27. Make the bar taller by dragging its edge; close it and start a new session: it opens with that size. Settings "Lines shown at first" only sets the starting height.
28. Stop the session (close button, shortcut, or Esc): the bar stays and asks **Save this conversation to History?** with Save / Don't save and "Remember my choice".
    Tick the box and answer: the next sessions do not ask (Settings shows Always save or Never save; change it there). With "Ask me each time" it asks again.
29. History: the saved session is one entry "Live captions, 14:05–14:42, English → German, 312 lines". "Open conversation" shows every line (translation, original,
    time) with Copy and Export .txt. Deleting the entry removes it. A session longer than 2,000 lines keeps the last 2,000. With the History turned off in Settings,
    saving says the conversation was not kept.

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
