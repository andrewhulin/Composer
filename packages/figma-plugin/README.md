# Design Composer · Figma plugin

A development plugin that carries prototypes between Composer and Figma through the clipboard.
It needs no network access.

## Install

In the Figma desktop app, go to **Plugins → Development → Import plugin from manifest…** and pick this folder's `manifest.json`.

## Use

**Composer → Figma**

1. In Composer, select a Build output and choose **Figma · send frames**. This copies the frames.
2. In Figma, run **Design Composer** and paste into **Paste from Composer**.
3. Choose **Build frames**.

The frames land on a page named **Design Composer**. Flexbox becomes auto layout.

**Figma → Composer**

1. Select a frame and choose **Copy selection for Composer**.
2. Paste onto Composer's canvas with ⌘V.

It arrives as a Figma source with the frame's PNG and its text.
