## Landing hero (opening act) — design brief

Implements the cinematic hero spec (full-screen video, a per-character staggered
fade headline, liquid-glass CTA, glass mobile menu) with Stax's content. The
headline uses the site's display style (Fraunces 600, -0.035em, italic sage
accent), the same treatment as "Own the world's best companies." just below.
Code: `src/components/site/CinematicHero.tsx`, styles in `src/app/globals.css`
(`.cine-hero`, `.cine-fade`, `.liquid-glass`, `.mobile-menu-glass`).

PROCESS:     a person states what they believe in; Vera turns it into real
             holdings that grow, transparently, on-chain.
CORE OBJECT: a glass sphere (the transparent, verifiable account — echoes Vera's
             orb) in which life grows: moss → flowers → butterflies.
RELATIONSHIP:empty sphere → living sphere, over one 8s loop.
METAPHOR:    a terrarium — a sealed, see-through container where value grows.
ENCODING:    none (atmospheric opener; data-bearing visuals start at the live
             phone demo just below).
CONTINUOUS:  the video loop never stops (autoplay, muted, loop, inline).
MICRO-BEAT:  the headline resolves letter by letter (0.07s stagger), then the
             subtitle (1.6s) and the liquid-glass CTA (2.0s) rise into place.
TRANSITION:  the bottom ~38% blurs progressively and dissolves (eased mask) into
             the page's own backdrop (paper, mesh and glow orbs, light or
             dark), so there is no seam before "Own the world's best
             companies."; then it scrolls away into the live phone section.
             The site's glass nav pill only appears once the hero is left, so
             the hero keeps its own nav; its mobile menu renders outside the
             masked section so the fade never dims it.
ASSETS:      `public/hero.mp4` (1080p re-encode of the spec's 4K clip, 1.1 MB),
             `public/brand/hero-poster.jpg` (first frame, avoids a black flash).
             Fraunces (already loaded site-wide) + Geist 300/400/500 via next/font.
COPY:        "Own what you / *believe in*." — "Tell Vera a goal in plain words, and
             own real shares in one tap." — CTA "Open the app".

Reduced motion: content renders immediately (no stagger, no rise); the video still
plays muted. Nothing is hidden behind an animation that might not run.
