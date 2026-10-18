# UI guidelines

The look is a flight-dynamics console: dense, monospace, instrument-panel. Keep it that way.

- **Type:** system monospace stack (`ui-monospace, JetBrains Mono, DejaVu Sans Mono, Menlo`) everywhere, 10–11px for data. Panel headers, table headers, field labels and buttons are uppercase with letter-spacing (.04–.12em).
- **Palette:** black and white only. Pure black page (`#000`), panels `#0a0a0a`, headers `#101010`, hairlines `#1f1f1f` / `#2e2e2e`, text `#cfcfcf`, highlight and accent `#f2f2f2`. No blue tints anywhere in the chrome. Colour appears only for status: green `#5fbf7f`, amber `#e0b050`, red `#e0605a`.
- **Structure:** panels butt against each other on a 1px grid (`gap:1px` over the line colour). Key/value data sits in 1px-ruled tiles. Square corners, no shadows, no blur.
- **Controls:** segmented buttons with 1px dividers; active state is a lighter fill plus a 2px white underline. Level tags (HIGH/MED/LOW) and route tags are 1px-bordered boxes.
- **Data colours:** total `#f2f2f2`, cosmic rays `#9a9a9a`, bad-case dashed `#6a6a6a`; solar storms amber, belts red, surface green.
- **Holograms:** vehicles are shown as monochrome holograms (`js/holo.js`): additive fresnel shading, scanlines, edge lines, slight flicker, engine plume tied to thrust.
- **Copy:** terse console labels are fine (`EPOCH UTC`, `MET`, `Δv`), but explanations and hazard notes should be readable sentences, not shorthand.
