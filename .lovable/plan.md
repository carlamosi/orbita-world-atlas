# ORBITA Refinement Pass (Enhanced)

Focus: clarity, immersion, learning effectiveness, performance, and long-term mastery retention. Preserve existing public APIs wherever possible. Do not remove any existing functionality that already works correctly. Build on top of the current architecture and maintain consistency with the Orbita design language.

## 1. Restore Premium Globe Aesthetic

**Goal:** roll back the procedural Earth experiment, restore the previous cinematic Orbita globe, and preserve all atlas improvements from M2 (real borders, adaptive picking, zoom controls, performance tiers).

- `src/features/globe/Globe3D.tsx`
  - Remove `createEarthMaterial` import, `earthRef`, the rAF tick loop, and the `globeMaterial` prop on `<Globe>`.
  - Restore the previous atmospheric Orbita globe:
    - Deep-space sphere.
    - Rich orbital atmosphere.
    - Soft violet atmospheric glow.
    - Subtle cyan edge illumination.
    - Cinematic depth and contrast.
    - No day/night Earth textures.
    - No procedural Earth shaders.
    - No realistic satellite Earth rendering.
  - Use a memoized `THREE.MeshPhongMaterial`:
    - Base: deep indigo `#0a0d1f`
    - Low shininess
    - Subtle specular reflection
    - Slight atmospheric color variation
  - Keep:
    - polygon borders
    - adaptive picking
    - zoom controls
    - OrbitControls
    - rings
    - hover state system
    - quality tiers
    - accessibility improvements

### Additional Globe Fixes

The atlas must accurately render all countries.

Current rendering bugs (France, overseas territories, microstates, etc.) must be audited.

Validate:

- France visible and selectable.
- Norway visible.
- Indonesia visible.
- Philippines visible.
- Japan visible.
- New Zealand visible.
- Greenland visible.
- Iceland visible.
- Small island states visible.

Verify ISO_A3 mapping between:

```

```

```
countries.json
GeoJSON polygons
Explorer
Find
Name
Flags
Capitals
Speed
Progress
```

Build a validation utility:

```

```

```
verifyCountryGeometryCoverage()
```

which confirms:

```

```

```
195 countries loaded
195 countries mapped
0 missing geometries
0 duplicate ISO codes
```

Explorer, Find, Name, Speed, Progress and Challenges must all consume the exact same canonical country source.

---

## 2. Find Mode — Zero Accidental Hints

**Goal:** while the user is searching for a country, there must be absolutely no accidental visual hint.

The current hover system can reveal information.

This destroys the challenge.

### Globe3D

Add:

```

```

```
disableHoverFeedback?: boolean
```

When enabled:

-   
No hover glow.  

-   
No hover altitude.  

-   
No hover opacity change.  

-   
No tooltip.  

-   
No country name.  

-   
No hover stroke change.  

-   
No hover cap color.  


All countries appear identical.

Borders remain visible.

### FindPage

During:

```

```

```
answerState === "idle"
```

enable:

```

```

```
disableHoverFeedback
```

Only after answer resolution may the selected country become highlighted.

### Prompt

Remove:

```

```

```
Africa · Eastern Africa
Europe · Western Europe
```

from default view.

Nothing should reveal continent information automatically.

---

## 3. Hint System — Progressive Reveal

**Goal:** hints are earned and progressively disclosed.

### Session Engine

Replace:

```

```

```
hintUsed: boolean
```

with:

```

```

```
hintLevel: 0 | 1 | 2 | 3
```

Keep backwards compatibility:

```

```

```
hintUsed = hintLevel > 0
```

### Hint Levels

Level 1:

```

```

```
Continent
```

Example:

```

```

```
Africa
```

Level 2:

```

```

```
Subregion
```

Example:

```

```

```
Eastern Africa
```

Level 3:

```

```

```
Starting letter + length
```

Example:

```

```

```
S _ _ _ _ _ _
```

### UI

Button progression:

```

```

```
Hint
Hint +1
Hint +2
Hint used
```

No continent/subregion should appear anywhere before hint usage.

Applies to:

```

```

```
Find
Name
Flags
Capitals
Speed
Future Expedition Mode
```

---

## 4. Name Country — Full Audit + Hard Mode Fixes

### Stability Audit

Current hard mode occasionally becomes unstable.

Audit:

-   
question transitions  

-   
focus restoration  

-   
race conditions  

-   
auto-advance  

-   
skipped questions  

-   
session completion  


### Validation

Use:

```

```

```
fuzzyMatch(
  value,
  current.name,
  current.altNames ?? []
)
```

everywhere.

Ensure:

```

```

```
altNames
```

are fully populated in countries.json.

Support:

```

```

```
United States
USA
US
United States of America
```

where appropriate.

### UX

Remove Submit button completely.

Hard mode should feel instant.

---

## 5. Instant Validation for Typing Modes

### Goal

If the answer is correct:

the game instantly knows.

No:

```

```

```
Submit
Check
Confirm
```

buttons.

### Implementation

Add:

```

```

```
exactMatch()
```

to:

```

```

```
src/lib/fuzzy.ts
```

based on:

```

```

```
normalize()
```

On every keystroke:

```

```

```
onChange
```

if exact match:

```

```

```
onSubmit(true)
```

Auto-advance handles the rest.

Applies to:

```

```

```
Name Hard
Flags Hard
Future Capitals Hard
Expedition Typing Challenges
```

---

## 6. Global Spacebar = Skip

### New Hook

```

```

```
src/hooks/useSkipHotkey.ts
```

### Rules

Space:

```

```

```
skip current question
```

if:

-   
no input focused  

-   
no textarea  

-   
no contenteditable  

-   
no open dialog  

-   
no modifier keys  


### Applies Everywhere

```

```

```
Find
Name
Flags
Capitals
Speed
Expedition
Future Modes
```

Behavior:

```

```

```
idle -> reveal wrong answer -> auto advance
feedback -> no-op
```

---

## 7. Universal Keyboard Controls

### Goal

Keyboard-first gameplay.

The entire platform must feel extremely fast.

### Requirements

Keys:

```

```

```
1
2
3
4
```

must select answers everywhere.

Audit:

```

```

```
Name Easy
Flags Easy
Capitals Easy
Speed Round
Daily Challenge
Weekly Challenge
Future Expedition
```

Requirements:

-   
works instantly  

-   
works after route transitions  

-   
works after skips  

-   
works after hints  

-   
works after focus changes  


Input fields must block shortcuts.

Typing modes must never accidentally trigger answer buttons.

---

## 8. Automatic Progression

### Goal

Never force unnecessary clicks.

Current flow:

```

```

```
Answer
Correct
Click Next
```

is too slow.

### Required

After answer resolution:

```

```

```
Correct
Incorrect
Reveal
Skip
```

show feedback briefly.

Then:

```

```

```
auto advance
```

Timing:

```

```

```
600-900ms desktop
800-1200ms mobile
```

No Next button required.

Session momentum is critical.

---

## 9. Flags Desktop Layout

### Goal

Desktop experience currently wastes vertical space.

### Improvements

-   
Center gameplay vertically.  

-   
Reduce top padding.  

-   
Fixed HUD.  

-   
Larger flag.  

-   
Better visual balance.  


### Desktop Layout

1440p+:

```

```

```
Flag
|
Prompt + Answers
```

2-column layout.

Avoid:

```

```

```
flag far below fold
```

---

## 10. Flags Hard Mode

### New Mode

```

```

```
Flag → Type Country
```

### SubModes

```

```

```
Country → Flag
Flag → Country
Flag → Type Country
```

Reuse shared:

```

```

```
HardInput
```

Instant validation.

No Submit.

Space skip enabled.

Preference persisted.

---

## 11. Explorer Mode Redesign

Current Explorer must behave like a true atlas.

### Goal

Explorer is not a quiz.

Explorer is a living world atlas.

### Requirements

Free navigation.

User may:

-   
zoom  

-   
rotate  

-   
pan  

-   
search  

-   
filter  


Clicking a country opens:

```

```

```
Flag
Capital
Population
Area
Languages
Currencies
Borders
Continent
Subregion
Fun Fact
Mastery Status
```

### Interactions

Country click:

```

```

```
smooth cinematic focus
```

No forced quizzes.

No overlays blocking exploration.

---

## 12. Confidence Map Audit

### Goal

Confidence heatmaps must be real.

Not decorative.

### Requirements

Every color derives from actual mastery calculations.

Confidence source:

```

```

```
Spaced repetition engine
answer history
accuracy
review intervals
difficulty
stability
retrievability
```

Validate:

```

```

```
No fake confidence values
No placeholder calculations
No random heatmap colors
```

Progress dashboard must reflect actual learning state.

---

## 13. Navbar Sync Indicator

### Goal

Reduce visual clutter.

Current Sync pill remains visible too long.

### New Behavior

After successful sync:

```

```

```
Synced
```

visible for:

```

```

```
3 seconds
```

Then fade away.

Show again only if:

```

```

```
syncing
offline
error
queued changes
```

Normal state:

```

```

```
hidden
```

---

## 14. Performance & Responsiveness

### Primary Target

Desktop first.

Optimize:

```

```

```
1440p
1600p
1920p
2560p
```

### Requirements

Maintain:

```

```

```
60fps
```

during:

-   
globe interaction  

-   
speed mode  

-   
explorer  

-   
progress dashboard  


Reduce:

-   
layout shifts  

-   
re-renders  

-   
expensive animations  


Audit:

```

```

```
React Profiler
```

for hotspots.

---

## 15. QA Pass

Validate:

### Find

-   
no hover hints  

-   
borders visible  

-   
hint hidden until requested  

-   
space skips  


### Name Easy

-   
1-4 keys work  

-   
auto advance  


### Name Hard

-   
instant validation  

-   
no submit  

-   
stable focus  

-   
auto advance  


### Flags

-   
desktop centered  

-   
hard mode works  

-   
keyboard works  


### Capitals

-   
hint progression  

-   
keyboard shortcuts  

-   
skip support  


### Speed

-   
mode selector works  

-   
scoring works  

-   
timer works  

-   
skip works  

-   
keyboard works  


### Explorer

-   
all countries render  

-   
France visible  

-   
click works  

-   
details correct  


### Progress

-   
confidence maps real  

-   
mastery calculations real  


### Globe

-   
premium Orbita look restored  

-   
no procedural Earth  

-   
no day/night Earth  

-   
borders crisp  

-   
zoom smooth  


---

## Technical Notes

### New Files

```

```

```
src/hooks/useSkipHotkey.ts
src/features/engine/HardInput.tsx
src/features/globe/verifyCountryGeometryCoverage.ts
```

### Deleted

```

```

```
src/features/globe/earthMaterial.ts
```

### Modified

```

```

```
Globe3D.tsx
FindPage.tsx
NamePage.tsx
FlagsPage.tsx
CapitalsPage.tsx
SpeedPage.tsx
ExplorerPage.tsx
ProgressPage.tsx
useSession.ts
fuzzy.ts
Navbar.tsx
```

### Constraints

-   
Strict TypeScript.  

-   
No any.  

-   
No API breaking changes.  

-   
No new heavy dependencies.  

-   
Preserve existing Globe3D API.  

-   
Preserve existing session architecture.  

-   
Preserve cinematic Orbita design language.  


### Final Requirement

Before implementing any new feature, first fix every existing bug, visual inconsistency, geometry issue, keyboard issue, auto-advance issue, confidence-map issue, and atlas rendering issue described above. Stability, learning quality, and responsiveness take priority over feature expansion.

**Go ahead and execute.**