'use client';

/**
 * src/app/page.tsx — Marketing Landing Page
 *
 * Single-file landing page for SecondBrainAiAssistant.
 * All copy is defined in constants at the top — edit there, not in JSX.
 *
 * Sections (in order):
 *   Navbar → Hero → Features → HowItWorks → Pricing → About → FooterCTA → Footer
 *
 * Fonts: Syne (display), DM Sans (body), JetBrains Mono (code/accents)
 * Animations: CSS keyframes only (in <style> block below)
 * No external animation libraries used.
 */

import { Syne, DM_Sans, JetBrains_Mono } from 'next/font/google';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FONTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const syne = Syne({ subsets: ['latin'], variable: '--font-syne', display: 'swap' });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COPY — edit all text here; sections reference these constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NAV_COPY = {
  logo: 'SecondBrain',
  links: ['Features', 'Pricing', 'About'] as const,
  cta: 'Start free',
};

const HERO_COPY = {
  badge: 'Your personal workspace OS',
  headline: ['Your second brain.', 'Smarter than ever.'],
  sub: 'The workspace OS for solopreneurs — with AI that thinks with you, a canvas for your ideas, and a knowledge graph that connects everything.',
  cta1: 'Start free →',
  cta2: 'See how it works',
};

const FEATURES_COPY = {
  title: 'Everything you need,',
  titleAccent: "nothing you don't",
  items: [
    { icon: '∞', title: 'Infinite Canvas',    desc: 'Connect ideas freely with arrows and blocks' },
    { icon: '✦', title: 'AI Agents',          desc: 'Summarize, expand, explain code, change tone' },
    { icon: '🕸', title: 'Knowledge Graph',   desc: 'See all your pages and connections visually' },
    { icon: '📋', title: 'Page Templates',    desc: 'Client, Project, Invoice with smart properties' },
    { icon: '🔒', title: 'Privacy First',     desc: 'Your data, your control, end-to-end encryption coming' },
    { icon: '⚡', title: 'Lightning Fast',    desc: 'Built for speed, works offline (coming soon)' },
  ],
};

const HOW_COPY = {
  title: 'Three ways to think',
  steps: [
    { num: '01', title: 'Write',    desc: 'Rich document editor with slash commands and smart formatting' },
    { num: '02', title: 'Connect',  desc: 'Infinite canvas with mind maps, arrows, and visual thinking' },
    { num: '03', title: 'Discover', desc: 'AI and knowledge graph surface insights you never knew you had' },
  ],
};

const PRICING_COPY = {
  title: 'Simple pricing',
  plans: [
    {
      name: 'Free', price: '$0', period: '/month',
      desc: 'Perfect to get started',
      features: ['50 AI actions/day', 'Unlimited pages', 'Canvas & knowledge graph', 'Rich editor with slash commands'],
      cta: 'Get started free', highlight: false, badge: null as string | null,
    },
    {
      name: 'Pro', price: '$9', period: '/month',
      desc: 'For serious solopreneurs',
      features: ['Unlimited AI actions', 'Priority support', 'Advanced templates', 'Everything in Free'],
      cta: 'Coming soon', highlight: true, badge: 'Most Popular' as string | null,
    },
  ],
};

const ABOUT_COPY = {
  title: 'Built differently',
  body: 'SecondBrain is designed from the ground up for people who work alone but think big. No corporate bloat, no feature creep — just a fast, private, AI-powered workspace that grows with you.',
  stats: [
    { value: '100%', label: 'Private' },
    { value: 'AI',   label: 'Powered' },
    { value: '∞',    label: 'For makers' },
  ],
};

const FOOTER_CTA_COPY = {
  headline: 'Start building your second brain today.',
  cta: 'Get started free →',
};

const FOOTER_COPY = {
  tagline: 'The workspace OS for solopreneurs.',
  links: ['Privacy', 'Terms'] as const,
  made: 'Made with ✦ for makers',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Particle {
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
  color: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function LandingPage() {
  const router = useRouter();
  const [particles, setParticles] = useState<Particle[]>([]);
  const [scrolled, setScrolled]   = useState(false);

  // Generate particles only on client to avoid hydration mismatch
  useEffect(() => {
    const colors = ['#7c3aed', '#60a5fa', '#a855f7', '#f4f4f5'];
    setParticles(
      Array.from({ length: 72 }, () => ({
        x:        Math.random() * 100,
        y:        Math.random() * 100,
        size:     Math.random() * 2 + 0.5,
        duration: Math.random() * 8 + 4,
        delay:    Math.random() * 6,
        opacity:  Math.random() * 0.35 + 0.08,
        color:    colors[Math.floor(Math.random() * colors.length)],
      })),
    );
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  const fontVars = `${syne.variable} ${dmSans.variable} ${jetbrainsMono.variable}`;

  return (
    <div
      className={fontVars}
      style={{ fontFamily: 'var(--font-dm)', backgroundColor: '#09090b', color: '#f4f4f5', minHeight: '100vh' }}
    >
      {/* SEO — React 19 hoists <title>/<meta> to <head> automatically */}
      <title>SecondBrain — The Workspace OS for Solopreneurs</title>
      <meta name="description" content="SecondBrain is the AI-powered workspace OS for solopreneurs. Infinite canvas, knowledge graph, rich editor, and AI agents that think with you." />
      <meta name="keywords"    content="workspace, solopreneur, AI assistant, knowledge graph, canvas, notes, productivity" />

      {/* ── Page-specific keyframes & helper classes ────────────────── */}
      <style>{`
        @keyframes lp-float-a {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-14px); }
        }
        @keyframes lp-float-b {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
        @keyframes lp-float-c {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-18px); }
        }
        @keyframes lp-particle {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-22px); }
        }
        @keyframes lp-glow-pulse {
          0%, 100% { opacity: 0.35; }
          50%       { opacity: 0.75; }
        }
        @keyframes lp-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .lp-float-a { animation: lp-float-a 4.5s ease-in-out infinite; }
        .lp-float-b { animation: lp-float-b 5.5s ease-in-out infinite 1.2s; }
        .lp-float-c { animation: lp-float-c 4.0s ease-in-out infinite 2.4s; }
        .lp-glow-pulse { animation: lp-glow-pulse 3.5s ease-in-out infinite; }

        .lp-gradient-text {
          background: linear-gradient(135deg, #7c3aed 0%, #60a5fa 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .lp-btn-primary {
          background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .lp-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 32px rgba(124, 58, 237, 0.55);
        }
        .lp-btn-ghost {
          border: 1px solid rgba(124, 58, 237, 0.4);
          transition: border-color 0.2s, background 0.2s;
        }
        .lp-btn-ghost:hover {
          border-color: rgba(124, 58, 237, 0.8);
          background: rgba(124, 58, 237, 0.1);
        }
        .lp-feature-card {
          transition: border-color 0.3s, transform 0.3s;
        }
        .lp-feature-card:hover {
          border-color: rgba(124, 58, 237, 0.45) !important;
          transform: translateY(-3px);
        }
        .lp-feature-card:hover .lp-card-glow {
          opacity: 1 !important;
        }
        .lp-noise {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          opacity: 0.022;
        }
        @media (max-width: 640px) {
          .lp-nav-links { display: none !important; }
          .lp-hero-cards { display: none !important; }
        }
      `}</style>

      {/* ━━━ NAVBAR — edit copy in NAV_COPY ━━━ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        backgroundColor: scrolled ? 'rgba(9,9,11,0.82)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        transition: 'background-color 0.3s, border-color 0.3s, backdrop-filter 0.3s',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <button
            onClick={() => router.push('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-syne)', fontSize: '20px', fontWeight: 700 }}
          >
            <span className="lp-gradient-text">✦</span>
            <span style={{ color: '#f4f4f5' }}>{NAV_COPY.logo}</span>
          </button>

          {/* Links + CTA */}
          <div className="lp-nav-links" style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            {NAV_COPY.links.map((link) => (
              <button
                key={link}
                onClick={() => scrollTo(link.toLowerCase())}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#71717a', fontSize: '14px', transition: 'color 0.2s', fontFamily: 'var(--font-dm)', padding: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#f4f4f5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#71717a'; }}
              >
                {link}
              </button>
            ))}
            <button
              onClick={() => router.push('/register')}
              className="lp-btn-primary"
              style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-dm)' }}
            >
              {NAV_COPY.cta}
            </button>
          </div>
        </div>
      </nav>

      {/* ━━━ HERO SECTION — edit copy in HERO_COPY ━━━ */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: '80px', paddingBottom: '60px' }}>

        {/* Particle star field */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {particles.map((p, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left:     `${p.x}%`,
                top:      `${p.y}%`,
                width:    `${p.size}px`,
                height:   `${p.size}px`,
                borderRadius: '50%',
                backgroundColor: p.color,
                opacity: p.opacity,
                animation: `lp-particle ${p.duration}s ease-in-out infinite ${p.delay}s`,
              }}
            />
          ))}
        </div>

        {/* Ambient glow orbs */}
        <div aria-hidden className="lp-glow-pulse" style={{ position: 'absolute', top: '15%', left: '10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.14) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div aria-hidden className="lp-glow-pulse" style={{ position: 'absolute', bottom: '15%', right: '10%', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(96,165,250,0.11) 0%, transparent 65%)', pointerEvents: 'none', animationDelay: '1.8s' }} />

        {/* Noise texture overlay */}
        <div aria-hidden className="lp-noise" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

        {/* Hero content */}
        <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', maxWidth: '920px', padding: '0 24px' }}>

          {/* Badge pill */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 16px', borderRadius: '100px', border: '1px solid rgba(124,58,237,0.35)', backgroundColor: 'rgba(124,58,237,0.08)', marginBottom: '36px', fontSize: '12px', color: '#a855f7', letterSpacing: '0.06em' }}>
            <span>✦</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{HERO_COPY.badge}</span>
          </div>

          {/* Headline */}
          <h1 style={{ fontFamily: 'var(--font-syne)', fontSize: 'clamp(44px, 8vw, 96px)', fontWeight: 800, lineHeight: 1.04, letterSpacing: '-0.03em', marginBottom: '28px' }}>
            <span style={{ display: 'block', color: '#f4f4f5' }}>{HERO_COPY.headline[0]}</span>
            <span style={{ display: 'block' }} className="lp-gradient-text">{HERO_COPY.headline[1]}</span>
          </h1>

          {/* Subheadline */}
          <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: '#71717a', maxWidth: '600px', margin: '0 auto 44px', lineHeight: 1.75 }}>
            {HERO_COPY.sub}
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '80px' }}>
            <button
              onClick={() => router.push('/register')}
              className="lp-btn-primary"
              style={{ padding: '14px 36px', borderRadius: '10px', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '16px', fontWeight: 600, fontFamily: 'var(--font-dm)' }}
            >
              {HERO_COPY.cta1}
            </button>
            <button
              onClick={() => scrollTo('features')}
              className="lp-btn-ghost"
              style={{ padding: '14px 32px', borderRadius: '10px', cursor: 'pointer', color: '#f4f4f5', fontSize: '16px', fontWeight: 500, backgroundColor: 'transparent', fontFamily: 'var(--font-dm)' }}
            >
              {HERO_COPY.cta2}
            </button>
          </div>

          {/* Floating UI preview cards */}
          <div className="lp-hero-cards" style={{ display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'flex-end', flexWrap: 'wrap' }}>

            {/* Canvas card */}
            <div className="lp-float-a" style={{ width: '196px', height: '164px', borderRadius: '16px', border: '1px solid rgba(124,58,237,0.28)', backgroundColor: 'rgba(124,58,237,0.04)', backdropFilter: 'blur(12px)', padding: '16px', overflow: 'hidden' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>Canvas</div>
              <div style={{ position: 'relative', height: '110px' }}>
                {/* Blocks */}
                <div style={{ position: 'absolute', left: '6px',  top: '8px',  width: '44px', height: '26px', borderRadius: '6px', backgroundColor: 'rgba(124,58,237,0.25)', border: '1px solid rgba(124,58,237,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#c4b5fd' }}>Idea</div>
                <div style={{ position: 'absolute', right: '6px', top: '4px',  width: '46px', height: '26px', borderRadius: '6px', backgroundColor: 'rgba(96,165,250,0.18)', border: '1px solid rgba(96,165,250,0.4)',   display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#93c5fd' }}>Note</div>
                <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: '8px', width: '50px', height: '26px', borderRadius: '6px', backgroundColor: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#d8b4fe' }}>Project</div>
                {/* SVG arrows */}
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 180 110" fill="none">
                  <line x1="50"  y1="21" x2="87"  y2="17" stroke="rgba(124,58,237,0.35)" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="130" y1="21" x2="93"  y2="17" stroke="rgba(96,165,250,0.3)"  strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="50"  y1="21" x2="87"  y2="76" stroke="rgba(168,85,247,0.25)" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="130" y1="21" x2="93"  y2="76" stroke="rgba(96,165,250,0.25)"  strokeWidth="1" strokeDasharray="3 3" />
                </svg>
              </div>
            </div>

            {/* AI Panel card (center, taller) */}
            <div className="lp-float-b" style={{ width: '224px', height: '210px', borderRadius: '16px', border: '1px solid rgba(124,58,237,0.45)', backgroundColor: 'rgba(17,17,23,0.85)', backdropFilter: 'blur(16px)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.12em' }}>AI Agent</div>
              <div style={{ padding: '8px 12px', borderRadius: '10px', backgroundColor: 'rgba(124,58,237,0.18)', fontSize: '10px', color: '#c4b5fd', alignSelf: 'flex-start', maxWidth: '88%', lineHeight: 1.5 }}>
                Summarize this page for me
              </div>
              <div style={{ padding: '8px 12px', borderRadius: '10px', backgroundColor: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', fontSize: '10px', color: '#93c5fd', alignSelf: 'flex-end', maxWidth: '92%', lineHeight: 1.5 }}>
                This page covers Q1 goals, focusing on user acquisition…
              </div>
              <div style={{ display: 'flex', gap: '5px', marginTop: 'auto', flexWrap: 'wrap' }}>
                {['Expand', 'Rewrite', 'Explain'].map((a) => (
                  <div key={a} style={{ padding: '4px 8px', borderRadius: '100px', backgroundColor: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', fontSize: '8px', color: '#a855f7' }}>{a}</div>
                ))}
              </div>
            </div>

            {/* Knowledge Graph card */}
            <div className="lp-float-c" style={{ width: '184px', height: '164px', borderRadius: '16px', border: '1px solid rgba(96,165,250,0.2)', backgroundColor: 'rgba(96,165,250,0.03)', backdropFilter: 'blur(12px)', padding: '16px', overflow: 'hidden' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' }}>Graph</div>
              <svg width="100%" height="120" viewBox="0 0 160 120" fill="none">
                <line x1="80" y1="60" x2="38"  y2="28"  stroke="rgba(124,58,237,0.35)" strokeWidth="1" />
                <line x1="80" y1="60" x2="122" y2="28"  stroke="rgba(124,58,237,0.3)"  strokeWidth="1" />
                <line x1="80" y1="60" x2="25"  y2="95"  stroke="rgba(96,165,250,0.35)" strokeWidth="1" />
                <line x1="80" y1="60" x2="135" y2="95"  stroke="rgba(96,165,250,0.3)"  strokeWidth="1" />
                <line x1="80" y1="60" x2="80"  y2="14"  stroke="rgba(168,85,247,0.3)"  strokeWidth="1" />
                <line x1="38" y1="28" x2="16"  y2="52"  stroke="rgba(124,58,237,0.2)"  strokeWidth="1" />
                <line x1="122" y1="28" x2="144" y2="52" stroke="rgba(96,165,250,0.2)"  strokeWidth="1" />
                <circle cx="80"  cy="60"  r="8"   fill="rgba(124,58,237,0.65)" stroke="#7c3aed" strokeWidth="1.5" />
                <circle cx="38"  cy="28"  r="5"   fill="rgba(96,165,250,0.55)"  stroke="#60a5fa" strokeWidth="1" />
                <circle cx="122" cy="28"  r="4"   fill="rgba(168,85,247,0.5)"  stroke="#a855f7" strokeWidth="1" />
                <circle cx="25"  cy="95"  r="4.5" fill="rgba(96,165,250,0.45)"  stroke="#60a5fa" strokeWidth="1" />
                <circle cx="135" cy="95"  r="5"   fill="rgba(168,85,247,0.45)" stroke="#a855f7" strokeWidth="1" />
                <circle cx="80"  cy="14"  r="3"   fill="rgba(244,244,245,0.3)" stroke="rgba(244,244,245,0.5)" strokeWidth="1" />
                <circle cx="16"  cy="52"  r="3"   fill="rgba(124,58,237,0.35)" stroke="rgba(124,58,237,0.6)" strokeWidth="1" />
                <circle cx="144" cy="52"  r="3"   fill="rgba(96,165,250,0.3)"  stroke="rgba(96,165,250,0.6)"  strokeWidth="1" />
              </svg>
            </div>

          </div>
        </div>

        {/* Scroll indicator */}
        <div aria-hidden style={{ position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', opacity: 0.35 }}>
          <div style={{ width: '1px', height: '40px', background: 'linear-gradient(to bottom, transparent, #7c3aed)' }} />
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#7c3aed' }} />
        </div>
      </section>

      {/* ━━━ FEATURES SECTION — edit copy in FEATURES_COPY ━━━ */}
      <section id="features" style={{ padding: '120px 24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '72px' }}>
          <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 'clamp(30px, 5vw, 54px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            <span style={{ color: '#f4f4f5' }}>{FEATURES_COPY.title} </span>
            <span className="lp-gradient-text">{FEATURES_COPY.titleAccent}</span>
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {FEATURES_COPY.items.map((feat) => (
            <div
              key={feat.title}
              className="lp-feature-card"
              style={{ position: 'relative', padding: '28px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)', overflow: 'hidden', cursor: 'default' }}
            >
              {/* Hover glow (opacity toggled by CSS) */}
              <div
                className="lp-card-glow"
                aria-hidden
                style={{ position: 'absolute', inset: 0, opacity: 0, background: 'radial-gradient(ellipse at 25% 25%, rgba(124,58,237,0.14) 0%, transparent 55%)', transition: 'opacity 0.3s', pointerEvents: 'none' }}
              />
              <div style={{ fontSize: '34px', lineHeight: 1, marginBottom: '16px' }}>{feat.icon}</div>
              <h3 style={{ fontFamily: 'var(--font-syne)', fontSize: '17px', fontWeight: 600, color: '#f4f4f5', marginBottom: '10px' }}>{feat.title}</h3>
              <p style={{ fontSize: '14px', color: '#71717a', lineHeight: 1.65 }}>{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ━━━ HOW IT WORKS — edit copy in HOW_COPY ━━━ */}
      <section style={{ padding: '80px 24px 120px', background: 'linear-gradient(180deg, transparent 0%, rgba(124,58,237,0.04) 50%, transparent 100%)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '80px' }}>
            <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 'clamp(30px, 5vw, 54px)', fontWeight: 700, letterSpacing: '-0.02em', color: '#f4f4f5' }}>
              {HOW_COPY.title}
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '56px' }}>
            {HOW_COPY.steps.map((step) => (
              <div key={step.num} style={{ position: 'relative' }}>
                {/* Large ghost number */}
                <div aria-hidden style={{ fontFamily: 'var(--font-syne)', fontSize: '130px', fontWeight: 800, color: 'rgba(255,255,255,0.028)', position: 'absolute', top: '-28px', left: '-14px', lineHeight: 1, userSelect: 'none', letterSpacing: '-0.04em', pointerEvents: 'none' }}>
                  {step.num}
                </div>
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#7c3aed', letterSpacing: '0.1em', marginBottom: '14px' }}>{step.num}</div>
                  <h3 style={{ fontFamily: 'var(--font-syne)', fontSize: '28px', fontWeight: 700, color: '#f4f4f5', marginBottom: '12px', letterSpacing: '-0.02em' }}>{step.title}</h3>
                  <p style={{ fontSize: '15px', color: '#71717a', lineHeight: 1.7 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ PRICING SECTION — edit copy in PRICING_COPY ━━━ */}
      <section id="pricing" style={{ padding: '120px 24px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '72px' }}>
            <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 'clamp(30px, 5vw, 54px)', fontWeight: 700, letterSpacing: '-0.02em', color: '#f4f4f5' }}>
              {PRICING_COPY.title}
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {PRICING_COPY.plans.map((plan) => (
              <div
                key={plan.name}
                style={{
                  padding: '36px', borderRadius: '20px', position: 'relative', overflow: 'hidden',
                  border:           plan.highlight ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.07)',
                  backgroundColor:  plan.highlight ? 'rgba(124,58,237,0.06)' : 'rgba(255,255,255,0.02)',
                  boxShadow:        plan.highlight ? '0 0 24px rgba(124,58,237,0.2)' : 'none',
                }}
              >
                {/* Top gradient line on highlighted card */}
                {plan.highlight && (
                  <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #7c3aed, #a855f7, transparent)' }} />
                )}

                {plan.badge && (
                  <div style={{ display: 'inline-block', marginBottom: '16px', padding: '3px 12px', borderRadius: '100px', backgroundColor: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', fontSize: '11px', color: '#a855f7', fontWeight: 600, letterSpacing: '0.05em' }}>
                    {plan.badge}
                  </div>
                )}

                <div style={{ fontFamily: 'var(--font-syne)', fontSize: '20px', fontWeight: 700, color: '#f4f4f5', marginBottom: '8px' }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-syne)', fontSize: '52px', fontWeight: 800, color: '#f4f4f5', letterSpacing: '-0.03em' }}>{plan.price}</span>
                  <span style={{ color: '#71717a', fontSize: '16px' }}>{plan.period}</span>
                </div>
                <p style={{ color: '#71717a', fontSize: '14px', marginBottom: '28px' }}>{plan.desc}</p>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '24px', marginBottom: '28px' }}>
                  {plan.features.map((f) => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <span style={{ color: '#7c3aed', fontSize: '14px', flexShrink: 0 }}>✦</span>
                      <span style={{ color: '#a1a1aa', fontSize: '14px' }}>{f}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={plan.highlight ? undefined : () => router.push('/register')}
                  disabled={plan.highlight}
                  className={plan.highlight ? '' : 'lp-btn-primary'}
                  style={{
                    width: '100%', padding: '13px', borderRadius: '10px',
                    border:           plan.highlight ? '1px solid rgba(124,58,237,0.3)' : 'none',
                    cursor:           plan.highlight ? 'not-allowed' : 'pointer',
                    color:            plan.highlight ? '#52525b' : '#fff',
                    fontSize: '15px', fontWeight: 600, fontFamily: 'var(--font-dm)',
                    backgroundColor:  plan.highlight ? 'transparent' : undefined,
                  }}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ ABOUT SECTION — edit copy in ABOUT_COPY ━━━ */}
      <section id="about" style={{ padding: '80px 24px 120px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ maxWidth: '880px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 700, letterSpacing: '-0.02em', color: '#f4f4f5', marginBottom: '24px' }}>
            {ABOUT_COPY.title}
          </h2>
          <p style={{ fontSize: '18px', color: '#71717a', maxWidth: '620px', margin: '0 auto 64px', lineHeight: 1.8 }}>
            {ABOUT_COPY.body}
          </p>
          <div style={{ display: 'flex', gap: '64px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {ABOUT_COPY.stats.map((stat) => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div className="lp-gradient-text" style={{ fontFamily: 'var(--font-syne)', fontSize: '40px', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '6px' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: '13px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ FOOTER CTA — edit copy in FOOTER_CTA_COPY ━━━ */}
      <section style={{ padding: '120px 24px', background: 'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.14) 0%, transparent 55%)', borderTop: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 'clamp(34px, 6vw, 64px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#f4f4f5', marginBottom: '48px', lineHeight: 1.1 }}>
            {FOOTER_CTA_COPY.headline}
          </h2>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            {/* Ambient glow behind button */}
            <div aria-hidden className="lp-glow-pulse" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '300px', height: '100px', background: 'radial-gradient(ellipse, rgba(124,58,237,0.35) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
            <button
              onClick={() => router.push('/register')}
              className="lp-btn-primary"
              style={{ position: 'relative', padding: '18px 48px', borderRadius: '12px', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-dm)' }}
            >
              {FOOTER_CTA_COPY.cta}
            </button>
          </div>
        </div>
      </section>

      {/* ━━━ FOOTER — edit copy in FOOTER_COPY ━━━ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '40px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '24px' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-syne)', fontSize: '18px', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="lp-gradient-text">✦</span>
              <span style={{ color: '#f4f4f5' }}>{NAV_COPY.logo}</span>
            </div>
            <div style={{ fontSize: '13px', color: '#52525b' }}>{FOOTER_COPY.tagline}</div>
          </div>

          <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
            {FOOTER_COPY.links.map((link) => (
              <a
                key={link}
                href="#"
                style={{ fontSize: '13px', color: '#52525b', textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#71717a'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#52525b'; }}
              >
                {link}
              </a>
            ))}
            <span style={{ fontSize: '13px', color: '#52525b' }}>{FOOTER_COPY.made}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
