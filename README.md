# Auto Flow

A Figma and FigJam plugin experiment for connecting two selected nodes with native connector objects.

> **Project status:** Early iteration. This repository documents the original Auto Flow prototype; it is not the polished, current version of the tool.

## What it explores

Connecting shapes in a diagram is easy to start and tedious to refine. Auto Flow explores a compact interface for controlling the relationship between two selected elements:

- Connector geometry: elbowed, straight, or curved.
- Start and end anchors (top, bottom, left, right, or automatic).
- Line color, thickness, and endpoint caps.
- Reusing a selected connector or a connector already present in the document.

The implementation deliberately favors **native Figma/FigJam connectors** instead of drawing independent decorative vector lines.

## How it works

1. Select two elements in a Figma or FigJam document.
2. Open Auto Flow and configure the connector.
3. Apply the connection. When a native connector is available, the plugin can relink or duplicate it between the selected elements.

**Important limitation:** FigJam exposes native connector creation. In Figma Design, this version depends on an existing connector or connector template; it does **not** provide a general-purpose vector fallback or guarantee native connector creation from an empty file.

## Explore the implementation

- [Plugin controller](code.ts) — selection, connector relinking, properties, and editor-specific behavior.
- [Plugin interface](ui.html) — controls and selection feedback.
- [Figma manifest](manifest.json) — plugin entry points and editor support.

## Run locally

Requirements: Node.js/npm and Figma Desktop.

```bash
npm install
npm run build
```

In Figma: **Plugins → Development → Import plugin from manifest…** and select `manifest.json`. For active development, use `npm run watch`.

## Context

This is one of my explorations at the intersection of interaction design, Figma automation, and UI engineering. More finished design-and-development work is available at [maxavend.com](https://www.maxavend.com/).

© Maximiliano Avendaño.
