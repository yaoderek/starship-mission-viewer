# UI guidelines

The interface is a working instrument. Every element on screen has to carry
information or be something you can act on. When in doubt, remove it.

## Type
- **Geist** for interface text, **Geist Mono** for numbers, dates, units and table data. Both ship in `fonts/` (OFL).
- Sentence case everywhere. No uppercase, letter-spaced label text.
- Sizes: 13px body, 12px secondary, 14–15px panel and card titles, one large size for page headings. Weight 500–600 for titles, 400 otherwise.

## No decoration that pretends to be information
- No eyebrows or kickers above headings ("INTERSTELLAR · FROM THE NOVEL").
- No pills, badges or chips for status. Status is a word in a status colour: <span>Go</span>, <span>High</span>.
- No step-number circles, glowing dots, icon bullets or "→" call-to-action text on things that are already clickable.
- No hint text that explains the obvious ("Click a row to select"). Use a `title` tooltip if it truly helps.
- Don't label a value when the value explains itself. When a label is needed it sits above the value in the secondary size and a dimmer grey, never in caps.

## Colour
- Neutral greys with no blue tint. Chrome is greyscale.
- Selected or active means brighter text plus one step lighter background. No coloured outlines or glow.
- Colour is reserved for data and status: good `--ok`, caution `--warn`, bad `--bad`, and the chart series. Keep them muted.

| token | value | use |
|---|---|---|
| `--bg` | `#0b0b0b` | page, gutters |
| `--p` | `#121212` | panels |
| `--p2` | `#181818` | panel headers, raised rows |
| `--p3` | `#1f1f1f` | hover, selected |
| `--ln` | `#242424` | the one hairline between regions |
| `--tx` | `#e8e8e8` | primary text |
| `--tx2` | `#a6a6a6` | secondary text |
| `--dim` | `#767676` | labels, units |

## Shape and surfaces
- Square corners. No `border-radius`.
- Separate regions with background steps first and a single 1px hairline only where two same-coloured surfaces meet. No boxes inside boxes.
- No drop shadows (except an expanded panel lifting above the grid), no gradients on controls, no backdrop blur, no hover lift.

## Copy
- Plain sentences. No em dashes, no chains of "·"-separated metadata longer than two items.
- Say what a number means in words a non-specialist can follow; keep the jargon in the source link.
