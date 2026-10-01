"use client";

// CinematicHero — the landing page's full-screen opening act, built to the
// cinematic hero spec: looping background video, a headline set letter by
// letter (StaggeredFade), a light Geist subtitle, a liquid-glass CTA, and a nav
// with a glass mobile menu. The headline uses the site's display style (the
// same Fraunces treatment as "Own the world's best companies.") and the bottom
// edge blurs and fades into the page so the hand-off to the next section is
// soft. Design brief: docs/design/hero.md.
//
// Link colours / type live in globals.css (.site .cine-hero …): the site's
// unlayered `.site a { color: inherit }` would otherwise beat Tailwind's
// layered utilities.
import { Fragment, useRef, useState } from "react";
import Link from "next/link";
import { Geist } from "next/font/google";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";

const geist = Geist({ subsets: ["latin"], weight: ["300", "400", "500"] });

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Meet Vera", href: "#vera" },
  { label: "Features", href: "#features" },
  { label: "Demo", href: "/demo" },
];

type Part = { text: string; em?: boolean };

/**
 * Fades a line in character by character (0.07s apart), once in view. `em` parts
 * render inside the italic accent, like `.hero-em` on the section below.
 * The first render is identical on server and client (always "hidden"); reduced
 * motion only shortens the transition to 0, so it never causes a hydration mismatch.
 */
function StaggeredFade({ parts }: { parts: Part[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const variants = {
    hidden: { opacity: 0 },
    show: (i: number) => ({ opacity: 1, y: 0, transition: reduce ? { duration: 0 } : { delay: i * 0.07 } }),
  };
  // Character offset of each part, so the stagger runs continuously across parts.
  const starts = parts.map((_, k) => parts.slice(0, k).reduce((n, p) => n + p.text.length, 0));
  return (
    <span ref={ref} className="block" aria-hidden="true">
      {parts.map((part, k) => {
        const chars = part.text.split("").map((ch, j) => (
          <motion.span
            key={j}
            custom={starts[k] + j}
            variants={variants}
            initial="hidden"
            animate={inView || reduce ? "show" : "hidden"}
          >
            {ch === " " ? " " : ch}
          </motion.span>
        ));
        return part.em ? (
          <em key={k} className="cine-em">
            {chars}
          </em>
        ) : (
          <Fragment key={k}>{chars}</Fragment>
        );
      })}
    </span>
  );
}

export function CinematicHero() {
  const [menuOpen, setMenuOpen] = useState(false);
  const reduce = useReducedMotion();
  // Same initial markup on server and client; reduced motion = instant transition.
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: reduce ? { duration: 0 } : { duration: 0.8, delay },
  });

  return (
    <>
      <section className={`cine-hero relative h-[100svh] min-h-[560px] w-full overflow-hidden ${geist.className}`}>
        <video
          className="absolute inset-0 h-full w-full object-cover object-center"
          src="/hero.mp4"
          poster="/brand/hero-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        />

        {/* Soft hand-off to the page: the bottom edge blurs progressively while the
            section's mask (globals.css) dissolves it into the page backdrop. */}
        <div aria-hidden="true" className="cine-fade pointer-events-none absolute inset-x-0 bottom-0 z-[5]" />

        {/* NAV */}
        <nav className="relative z-20 flex items-center justify-between px-5 pt-6 sm:px-8 md:justify-center md:gap-16 md:pt-8">
          <a href="#top" className="cine-brand text-sm font-light uppercase tracking-[0.25em] md:text-base md:tracking-[0.3em]">
            Stax
          </a>
          <div className="hidden items-center gap-10 md:flex">
            {LINKS.map((l) => (
              <a key={l.label} href={l.href} className="cine-link text-xs uppercase tracking-[0.2em]">
                {l.label}
              </a>
            ))}
          </div>
          <button
            className="cine-toggle md:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </nav>

        {/* HERO CONTENT */}
        <div className="relative z-10 flex flex-col items-center px-5 pt-12 text-center sm:px-8 sm:pt-16 md:pt-24">
          <h1
            aria-label="Own what you believe in."
            className="cine-title mb-6 text-5xl text-white sm:mb-8 sm:text-6xl md:text-8xl lg:text-9xl"
          >
            <StaggeredFade parts={[{ text: "Own what you" }]} />
            <StaggeredFade parts={[{ text: "believe in", em: true }, { text: "." }]} />
          </h1>

          <motion.p
            {...rise(1.6)}
            className="mb-8 max-w-xs text-sm font-light leading-relaxed text-white/70 sm:mb-10 sm:max-w-md sm:text-base md:text-lg"
          >
            Tell Vera a goal in plain words,
            <br className="hidden sm:block" /> and own real shares in one tap.
          </motion.p>

          <motion.div {...rise(2.0)}>
            <Link
              href="/app"
              className="liquid-glass inline-block rounded-full px-7 py-3.5 text-xs uppercase tracking-[0.18em] sm:px-10 sm:py-4 sm:text-sm sm:tracking-[0.2em]"
            >
              Open the app
            </Link>
          </motion.div>
        </div>
      </section>

      {/* MOBILE MENU: a sibling of the section, not a child, so the section's
          bottom fade mask can never clip or dim it. */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className={`mobile-menu-glass fixed left-4 right-4 top-16 z-50 flex flex-col items-center gap-5 rounded-2xl py-8 md:hidden ${geist.className}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {LINKS.map((l, i) => (
              <motion.a
                key={l.label}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="cine-mlink text-sm font-light uppercase tracking-[0.25em]"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.06 }}
              >
                {l.label}
              </motion.a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
