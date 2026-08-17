---
name: Midnight Match
colors:
  surface: '#101419'
  surface-dim: '#101419'
  surface-bright: '#36393f'
  surface-container-lowest: '#0a0f13'
  surface-container-low: '#181c21'
  surface-container: '#1C2025'
  surface-container-high: '#262a30'
  surface-container-highest: '#31353B'
  on-surface: '#e0e2ea'
  on-surface-variant: '#D6C4AD'
  inverse-surface: '#e0e2ea'
  inverse-on-surface: '#2d3136'
  outline: '#9f8e79'
  outline-variant: '#514533'
  surface-tint: '#ffba47'
  primary: '#ffd79e'
  on-primary: '#442b00'
  primary-container: '#ffb224'
  on-primary-container: '#6c4800'
  inverse-primary: '#805600'
  secondary: '#44e2cd'
  on-secondary: '#003731'
  secondary-container: '#03c6b2'
  on-secondary-container: '#004d44'
  tertiary: '#e6d6ff'
  on-tertiary: '#3f008e'
  tertiary-container: '#ceb5ff'
  on-tertiary-container: '#630fd4'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffddb0'
  primary-fixed-dim: '#ffba47'
  on-primary-fixed: '#291800'
  on-primary-fixed-variant: '#614000'
  secondary-fixed: '#62fae3'
  secondary-fixed-dim: '#3cddc7'
  on-secondary-fixed: '#00201c'
  on-secondary-fixed-variant: '#005047'
  tertiary-fixed: '#eaddff'
  tertiary-fixed-dim: '#d2bbff'
  on-tertiary-fixed: '#25005a'
  on-tertiary-fixed-variant: '#5a00c6'
  background: '#101419'
  on-background: '#e0e2ea'
  surface-variant: '#31353b'
  outline-muted: rgba(159, 142, 121, 0.1)
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-label:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  score-display:
    fontFamily: JetBrains Mono
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  score-mobile:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 32px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  stack-tight: 4px
  card-gap: 12px
  container-padding: 16px
  section-margin: 24px
---

## Brand & Style

Midnight Match is a premium, high-stakes sports dashboard designed for the "night owl" fan. The brand personality is intense, analytical, and immersive, evoking the atmosphere of a floodlit stadium under a dark sky. 

The design style is **Glassmorphism mixed with Modern Dark Mode**. It utilizes deep charcoal surfaces, vibrant neon accents (Amber and Teal), and subtle transparency effects to create a multi-layered, high-tech aesthetic. The emotional response should be one of excitement, precision, and exclusivity—like being in a private VIP box during a midnight kickoff.

## Colors

The palette is anchored in a "Midnight" theme.
- **Primary (Amber #FFB224):** Used for focus actions, countdowns, and "floodlight" glow effects. It represents energy and the heat of the game.
- **Secondary (Teal #2DD4BF):** Used for live status indicators, secondary highlights, and specialized data tracks.
- **Tertiary (Violet #7C3AED):** Reserved for league branding or category tags to provide a rich, editorial contrast.
- **Neutral/Background (#101419):** A deep, slightly blue-tinted black that serves as the canvas for all glass and elevation effects.

Success and Live states use the secondary Teal with an animate-pulse effect. Interactive elements use high-contrast text (On-Primary/On-Secondary) to ensure legibility against vibrant backgrounds.

## Typography

The system uses a tri-font approach to balance editorial style with technical data:
- **Hanken Grotesk (Headlines):** Delivers a sharp, modern, and confident voice for section titles and main branding.
- **Be Vietnam Pro (Body):** An approachable and highly legible sans-serif for narrative text and team names.
- **JetBrains Mono (Data/Scores):** A monospaced font used for time, scores, and metadata labels, reinforcing the "technical dashboard" feel. 

For mobile devices, headlines scale down to `headline-md` and large score displays use the `score-mobile` variant to maintain layout integrity.

## Layout & Spacing

The layout follows a **Fixed-Width Mobile-First** philosophy (max-width: 512px / 32rem) centered on the screen. 
- **Grid:** A single-column vertical stack for mobile, transitioning to a multi-column grid for tablets.
- **Rhythm:** An 8px base unit drives all spacing. Tight internal card content uses 4px (stack-tight), while major page sections are separated by 24px (section-margin).
- **Margins:** Standard horizontal padding of 16px (container-padding) ensures content does not touch the edge of the viewport.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Glassmorphism**:
- **Level 0 (Background):** The base `#101419` surface.
- **Level 1 (Sub-cards):** Surface-container-low `#181C21` with subtle 1px borders.
- **Level 2 (Main Hero):** Surface-container-highest `#31353B` with a `shadow-lg` and `shadow-black/50`.
- **Special (Glass Panels):** Used for horizontal scrolling "stories". These use a linear gradient with a `backdrop-filter: blur(10px)` and a thin, low-opacity outline.
- **Glows:** The primary action button and specific data points (like countdowns) use a `text-glow` or `floodlight-glow` (box-shadow with primary color at 15% opacity) to simulate light emission.

## Shapes

The shape language is **Rounded**, providing a premium feel that softens the high-contrast dark theme.
- **Large Cards/Hero:** 12px (0.75rem) corner radius.
- **Buttons/Input Fields:** 12px (0.75rem) corner radius.
- **Chips/Badges:** Fully rounded (pill-shaped) for tag-like elements.
- **Team Icons:** Circular (9999px) to differentiate from layout-defining rectangles.

## Components

- **Buttons:** Primary buttons are large, spanning full width with a 12px radius, utilizing the primary color and a "floodlight glow."
- **Hero Cards:** Featured matches include a vertical accent bar on the left edge (Secondary color) and a background slightly lighter than the page surface.
- **Chips:** Small, rounded-full elements with 10% background opacity of their stroke color (e.g., Primary/10% bg + Primary/40% border).
- **Match Strips:** Horizontal layouts for upcoming games use a simple vertical divider and `data-label` typography for time/date.
- **Navigation:** The bottom bar uses an 80% opaque surface with a heavy blur (`backdrop-blur-xl`) to allow content to peek through while maintaining legibility. Active states are indicated by a 1.1x scale and a dot indicator.