"use client";

// CinematicHero — the landing page's full-screen opening act, built to the
// cinematic hero spec: looping background video, Garamond display set letter by
// letter (StaggeredFade), a light Geist subtitle, a liquid-glass CTA, and a nav
// with a glass mobile menu. Content is Stax's. Design brief: docs/design/hero.md.
//
// Link colours live in globals.css (.site .cine-hero …): the site's unlayered
// `.site a { color: inherit }` would otherwise beat Tailwind's layered utilities.
import { useRef, useState } from "react";
import Link from "next/link";
import { Geist } from "next/font/google";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";

const geist = Geist({ subsets: ["latin"], weight: ["300", "400", "500"] });

const GARAMOND_CSS = "https://db.onlinewebfonts.com/c/2bf40ab72ea4897a3fd9b6e48b233a19?family=Garamond";

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Meet Vera", href: "#vera" },
  { label: "Features", href: "#features" },
  { label: "Demo", href: "/demo" },
];

/**
 * Splits `text` into characters that fade in one after another (0.07s apart), once in view.
 * The first render is identical on server and client (always "hidden"); reduced motion
 * only shortens the transition to 0, so it never causes a hydration mismatch.
 */
function StaggeredFade({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const variants = {
    hidden: { opacity: 0 },
    show: (i: number) => ({ opacity: 1, y: 0, transition: reduce ? { duration: 0 } : { delay: i * 0.07 } }),
  };
  return (
    <span ref={ref} className="block" aria-hidden="true">
      {text.split("").map((ch, i) => (
        <motion.span
          key={i}
          custom={i}
          variants={variants}
          initial="hidden"
          animate={inView || reduce ? "show" : "hidden"}
        >
          {ch === " " ? " " : ch}
        </motion.span>
      ))}
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
    <section className={`cine-hero relative h-[100svh] min-h-[560px] w-full overflow-hidden ${geist.className}`}>
      {/* React 19 hoists this into <head> (deduped), so Garamond only loads on the landing. */}
      <link rel="stylesheet" href={GARAMOND_CSS} precedence="default" />

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

      {/* MOBILE MENU */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="mobile-menu-glass fixed left-4 right-4 top-16 z-50 flex flex-col items-center gap-5 rounded-2xl py-8 md:hidden"
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

      {/* HERO CONTENT */}
      <div className="relative z-10 flex flex-col items-center px-5 pt-12 text-center sm:px-8 sm:pt-16 md:pt-24">
        <h1
          aria-label="Own what you believe in"
          className="font-garamond mb-6 text-4xl font-normal leading-[1.08] tracking-tight text-white sm:mb-8 sm:text-6xl md:text-8xl lg:text-9xl"
        >
          <StaggeredFade text="OWN WHAT YOU" />
          <StaggeredFade text="BELIEVE IN" />
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
  );
}
