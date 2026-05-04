# Foleyard: A Local-First Browser for Your Sound Library

Audio libraries don't get messy overnight. They grow slowly. A few sound effects here, some music cues there, downloaded packs, old project files, recordings you made and forgot to rename. Eventually the sounds are still there, but finding the right one takes longer than it should.

Foleyard is an open source sound library browser for large collections of sound effects and music. Point it at a folder on your machine. It indexes the audio files, lets you browse, search, preview, favorite, and organize them into playlists.

Built for people who already have audio files locally and want a faster way to work with them.

## The problem

For a small collection, the file explorer is usually enough. You make a folder for impacts, another for ambience, another for music, and it feels manageable. Once the library grows, that setup breaks.

You know you have the right sound somewhere, but you don't remember where. You have hundreds of files with vague names. You open ten sounds in a row just to find one that fits. You keep reusing the same handful of files because they're easier to find than the rest of your library.

That's the problem Foleyard tries to solve. Not storage. Access.

A sound library is only useful if you can move through it quickly. You should be able to search, preview, save, and group sounds without jumping between a file explorer, a media player, and your editing software.

Foleyard gives your existing library a better interface.

## Who it's for

Foleyard is for anyone who keeps a local collection of sound effects, music, samples, loops, cues, or audio assets.

That could be:

- Video editors looking for sound effects and music while cutting
- Indie game developers managing audio assets for projects
- Filmmakers and motion designers working with large SFX folders
- Musicians and producers browsing samples or loops
- Sound designers organizing recordings and sound packs
- Developers interested in open source media tools
- Anyone with a messy folder full of useful audio files

It's not trying to replace your DAW, your video editor, or your file system.

The goal is smaller and more practical: make it easier to find and organize the sounds you already have.

## Why local-first matters

Foleyard is local-first. Your audio files stay on your machine. You don't need to upload your library to a cloud platform just to browse it properly. That matters if your library is large, personal, licensed, private, or something you prefer to keep local.

Foleyard works around your existing folder structure instead of forcing you to rebuild everything from scratch. Point it at a folder, let it index your audio files, and start browsing.

## Features

The core features are intentionally simple:

- Index audio files from a local folder
- Browse your library
- Search through indexed files
- Preview sounds inside the app
- Favorite useful files
- Organize sounds into playlists

Search helps when folder names aren't enough. Previewing helps when filenames are unclear. Favorites help you avoid losing useful sounds again. Playlists let you build smaller collections inside a much larger library.

For example, you could create a playlist for a specific video project, a set of favorite impacts, a folder of UI sounds, a collection of ambience tracks, or a group of music cues you want to test later.

The point is to make your library easier to use, not more complicated.

## How it works

Foleyard starts with a folder on your machine.

You choose the folder that contains your sound effects, music, samples, or other audio files. Foleyard scans that folder and builds an index of the audio files it finds.

Once the library is indexed, you can browse through the files, search across them, preview sounds, mark files as favorites, and organize them into playlists.

The basic flow is:

1. Choose a folder that contains your audio files.
2. Let Foleyard scan and index the folder.
3. Browse or search your library.
4. Preview sounds directly in the app.
5. Favorite the sounds you want to keep close.
6. Create playlists for projects, categories, or ideas.

The files stay where they are. Foleyard gives you a better way to work with them.

## Why I built it

My own sound library became annoying to use.

I had a collection of sound effects and music that I knew was valuable, but it was buried across folders. I could usually find something eventually, but "eventually" isn't good enough when you're in the middle of making something.

I wanted a tool that felt simple and direct.

I didn't want to upload everything somewhere. I didn't want to reorganize my entire library before using it. I didn't want a heavy media manager full of features I would never touch.

I wanted to point an app at a folder and get a usable sound browser.

That's what Foleyard is becoming.

The first version is focused on the basics: indexing, browsing, searching, previewing, favorites, and playlists. From there, I want the project to improve based on real use and real feedback.

Some future ideas include better metadata support, waveform visualization, and integration with common editing software.

## Getting started

Foleyard is open source and available on GitHub.

To try it:

1. Visit the repository: https://github.com/Daelars/foleyard-v1
2. Clone the project.
3. Install the dependencies.
4. Run the app locally.
5. Choose a folder with your audio files.
6. Let Foleyard index the library.
7. Start browsing, searching, previewing, favoriting, and building playlists.

Example setup:

```bash
git clone https://github.com/Daelars/foleyard-v1
cd foleyard
bun install
bun run dev
bun run dev:desktop
```

Check the README for the latest setup instructions, supported formats, and current limitations.

Foleyard is still early, so there will be rough edges. If you run into a bug, confusing behavior, or something that feels slower than it should, please open an issue with as much detail as you can. That kind of feedback is genuinely useful.

## Try it out

Foleyard started as a small tool for a real problem: browsing a local sound library shouldn't feel like digging through a junk drawer.

If you work with sound effects, music cues, samples, or large folders of audio, I'd love for you to try it with your own library.

You can help by starring the repo, testing it locally, opening issues, suggesting improvements, or just telling me what does and doesn't work for your workflow.

Try Foleyard here: **https://github.com/Daelars/foleyard-v1**
