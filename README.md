# Codebook

An IntelliJ-style notebook for university lectures. It has themes, keymaps, tool windows and plugins, with maths, code and images built in. Your notes are saved as files on your computer, and nothing is sent anywhere.

## Install (Windows)

1. Open the **Releases** page of this repository and download `Codebook-Setup-x.y.z.exe`.
2. Double-click it. Windows might say *"Windows protected your PC"* because the app isn't code-signed. Click **More info → Run anyway**.
3. Pick an install location. The installer adds a Start menu entry and a desktop shortcut.

Every push to `main` builds a new installer automatically (see *Actions*). **Help › Check for Updates** tells you when a newer build is available.

## Where your notes live

The default folder is `Documents\Codebook` (if you used the app back when it was called Lecture Notes, it keeps using `Documents\LectureNotes`):

| Path | What |
|---|---|
| `workspace.json` | your modules and folders |
| `notes/*.json` | one file per note |
| `images/` | every image you paste or drop in, as normal image files |
| `.history/` | earlier versions of each note (*File › Show Local History*) |
| `.trash/` | deleted notes (*File › Restore Deleted Note*) |

To sync between computers, open a folder inside OneDrive, Google Drive or Dropbox with **File › Open Notes Folder…**. Changes made on another computer appear automatically.

## Highlights

- **IntelliJ look and feel**: switch between the New UI and Classic UI. There are tool window bars, a main menu, a status bar and breadcrumbs.
- **12 themes**: Dark, Light, Darcula, IntelliJ Light, High Contrast, Tokyo Night, Catppuccin Mocha, Dracula, Nord, GitHub Dark, Gruvbox and Solarized Light. You can also pick any accent colour or set a background image.
- **Settings** (`Ctrl+Alt+S`): searchable, with every editor colour editable, fonts, a keymap editor (IntelliJ or VS Code preset, all rebindable) and plugins you can switch on and off.
- **Search Everywhere** (`Double Shift`), **Find Action** (`Ctrl+Shift+A`), **Find in Notes** (`Ctrl+Shift+F`), **Recent Notes** (`Ctrl+E`), and a **Switcher** (`Ctrl+Tab`).
- **Editing**: markdown shortcuts as you type, a `/` command menu, `[[links]]` between notes with backlinks, LaTeX maths, highlighted code blocks in 30+ languages, tables, checklists, and callouts (Definition, Theorem, Example, Warning…). You can collapse heading sections, move lines up and down (`Alt+Shift+↑/↓`), duplicate (`Ctrl+D`), and extend the selection (`Ctrl+W`).
- **Images**: paste a screenshot (`Win+Shift+S`, then `Ctrl+V`) or drag images in. You can resize, align, caption and view them full size.
- **Lecture timer**: press ▶ (`Shift+F10`) at the start of a lecture. `Alt+Shift+T` drops a timestamp into your notes so you can find that moment in the recording.
- **TODO window**: gathers every unchecked checkbox from every note.
- **Export** to Markdown (Obsidian-compatible), HTML or PDF. You can also import Markdown files.

> IntelliJ keymap note: `Ctrl+Y` **deletes a line** and redo is `Ctrl+Shift+Z`, as in IntelliJ. Switch to the VS Code preset in *Settings › Keymap* if you'd rather have `Ctrl+Y` redo.

## Build it yourself

```bash
npm install
npm start          # run the app
npm run dist:win   # build the installer into dist/
```

## Discord Rich Presence

Settings → Tools → Discord Rich Presence. Shows "Playing Codebook — Editing <note>" in your Discord profile while the Discord desktop app is open. You can show the note title, only the module, or nothing specific.
