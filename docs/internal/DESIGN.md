# barkcli — Design System

> "Warm terminal. Brown dog. Black coffee."
> barkcli feels like your favorite terminal setup: monospace fonts, warm brown accents, and a familiar, comfortable presence — like a dog at your feet while you code.

## References

The visual direction follows common developer-tool conventions: install
command front and center, monospace code blocks, dark-first theming,
typography-driven layout with intentional spacing.

## Color Palette

```
White + black primary palette. Brown accent matches the 🐶 icon.

Backgrounds
  --bg-primary:      #FFFFFF    Page background
  --bg-secondary:    #FAFAFA    Card backgrounds, alternate sections
  --bg-terminal:     #1A1816    Terminal / code blocks (near-black, warm)

Text
  --text-primary:    #111111    Headings
  --text-body:       #333333    Body text
  --text-muted:      #777777    Captions, secondary labels

Brown accent (🐶 dog brown)
  --brown-700:       #6B4226    Dark brown — used sparingly for emphasis
  --brown-600:       #8B5E3C    Primary accent — CTAs, links, active states
  --brown-400:       #B8845C    Hover states, secondary accents
  --brown-100:       #F5EDE3    Subtle warm background, badges, highlights

Functional
  --border:          #E5E5E5    Divider lines, card borders
  --green:           #059669    Success states, checkmarks
  --red:             #DC2626    Errors, destructive actions
```

## Typography

| Role | Font | Weight | Size |
|---|---|---|---|
| Hero heading | Inter | 800 extrabold | 56-72px |
| Section headings | Inter | 700 bold | 30-36px |
| Body | Inter | 400-500 regular/medium | 14-18px |
| Code / terminal | JetBrains Mono | 400-500 | 13-14px |
| Captions | Inter | 400 | 11-12px |

## Spacing

```
Section vertical padding: py-24 (96px) or py-28 (112px)
Card padding:          p-8 (32px)
Content max-width:     max-w-5xl (1024px) or max-w-3xl (768px)
Grid gap:              gap-3 (12px) or gap-5 (20px)
```

## Border Radius

```
Cards:                  rounded-2xl (16px)
Buttons:                rounded-lg (8px)
Terminal blocks:        rounded-2xl (16px)
```

## Component Patterns

### Terminal Block (signature element)

```
┌─ border: 1px solid var(--border) ────────────────┐
│ ○ ○ ○  terminal                                   │ ← header bar
├───────────────────────────────────────────────────┤
│ $ barkcli init                                    │ ← code content
│ $ barkcli add "Fix auth" -p high                  │   JetBrains Mono, 14px
│ $ barkcli list                                    │   bg: var(--bg-terminal)
│                                                   │   text: #D4D4D4
│ █                                                 │ ← blinking cursor (green)
└───────────────────────────────────────────────────┘
```

### Card

```
┌─ border: 1px solid var(--border) ─────────────────┐
│ ┌──┐                                               │
│ │🗂│  Feature Title                                 │ ← icon + heading
│ └──┘                                               │
│ Description text in --text-body                    │
│                                                    │
│ $ barkcli tui                                      │ ← code snippet (muted)
└────────────────────────────────────────────────────┘
```

### Button Variants

```
Primary:   bg-brown-600  text-white     hover:bg-brown-700
Secondary: border        text-primary   hover:bg-gray-50
Ghost:     text-brown-600               hover:text-brown-700
```

## Animation

**One orchestrated moment**: The cursor blink in the terminal demo block. That's it.

```css
@keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
.cursor { animation: blink 1.4s step-end infinite; color: var(--green); }
```

No scroll-reveal, no parallax, no hover animations beyond `transition-colors`. Every element serves a purpose. Every animation has a reason.

## Layout Structure

```
1. Nav            — 64px, white, border-bottom
2. Hero           — py-28, centered, install command front-and-center
3. Terminal Demo  — max-w-2xl, signature code block
4. Features       — 3-col grid, cards with code snippets
5. AI Teaser      — warm brown-tinted section, terminal demo
6. Features II     — AI section, terminal demo
7. Testimonials   — 3 quotes in cards
8. FAQ            — accordion, max-w-2xl
9. CTA            — centered, brown button
10. Footer        — minimal, 48px
```

## Tone

- **Direct, not clever.** Say what the tool does.
- **Warm, not corporate.** Like a good README, not a press release.
- **Confident, not loud.** Let the terminal demo do the selling.
- **Developer-native.** Use `$` prompts, real code, real flags.
