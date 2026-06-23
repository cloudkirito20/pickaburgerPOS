# Picka Burger React Loader

This version fixes the stretching issue. The animation now uses only `translateY()` and small `rotate()` movement. It does not scale the burger/logo image.

## Setup

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal, usually:

```text
http://localhost:5173
```

## Build

```bash
npm run build
```

Production files will be inside `dist/`.

## Notes

The current logo is a single flattened PNG, so the hand is simulated by clipping the top part of the same image. For the cleanest professional animation, provide an editable logo file with separated layers: hand, burger, and text.
