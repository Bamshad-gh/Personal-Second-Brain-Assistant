'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ─── Data ───────────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: '✦', title: 'Block Editor',     desc: 'Write with rich text, code blocks, tables, callouts, and media — all in one place.' },
  { icon: '∞', title: 'Infinite Canvas',  desc: 'Visualize ideas spatially — drag blocks freely, connect them with arrows, think without limits.' },
  { icon: '🤖', title: 'AI Assistant',   desc: 'Write, summarize, create pages, fix code, and chat with AI grounded in your own notes.' },
  { icon: '🕸', title: 'Knowledge Graph', desc: 'See connections between all your pages as a live, interactive force-directed graph.' },
  { icon: '⬛', title: 'Column Layouts',  desc: 'Organize content side by side with drag-and-drop column creation.' },
  { icon: '↗', title: 'Share to Canvas', desc: 'Move any block from your document onto the infinite canvas with one click.' },
] as const;

const HOW_STEPS = [
  { num: '01', title: 'Write',     desc: 'Use the block editor with slash commands, page links, and rich formatting to capture everything.' },
  { num: '02', title: 'Visualize', desc: 'Switch to the infinite canvas to spatially arrange, connect, and explore your ideas.' },
  { num: '03', title: 'Ask AI',    desc: 'Let the AI assistant write, summarize, and answer questions using your own notes as context.' },
] as const;

const PLANS = [
  {
    name:      'Free',
    price:     '$0',
    period:    'forever',
    badge:     'Always free — start here',
    highlight: false,
    cta:       'Get started free',
    href:      '/register',
    features: [
      '3 workspaces',
      'Unlimited pages',
      'Block editor + Infinite canvas',
      '50 AI actions per day',
      'Knowledge graph',
      'Voice-to-text input',
    ],
  },
  {
    name:      'Pro',
    price:     '$12',
    period:    'per month',
    badge:     'Most popular',
    highlight: true,
    cta:       'Upgrade to Pro',
    href:      '/register',
    features: [
      'Everything in Free',
      'Unlimited AI actions',
      'Unlimited workspaces',
      'Priority AI models (Claude Opus)',
      'PDF export',
      'Priority support',
    ],
  },
  {
    name:      'Team',
    price:     'Custom',
    period:    '',
    badge:     'Coming soon',
    highlight: false,
    cta:       'Contact us',
    href:      'mailto:hello@spatialscribe.com',
    features: [
      'Everything in Pro',
      'Collaborative editing',
      'Shared workspaces',
      'Admin dashboard',
      'SLA + dedicated support',
    ],
  },
] as const;

const APP_TAGS = ['Notion', 'Miro', 'ChatGPT', 'Obsidian', 'Sticky notes', 'Email drafts'] as const;

// ─── Scroll-reveal hook ─────────────────────────────────────────────────────────

function useScrollReveal(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const els = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add('revealed');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ready]);
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [scrolled,  setScrolled]  = useState(false);
  useScrollReveal(!checking);

  // Redirect logged-in users straight to the app
  useEffect(() => {
    const hasSession = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith('has_session=true'));
    if (hasSession) {
      router.push('/workspace');
    } else {
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    if (checking) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [checking]);

  if (checking) return null;

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  function handlePlanClick(href: string) {
    if (href.startsWith('mailto:')) {
      window.location.href = href;
    } else {
      router.push(href);
    }
  }

  return (
    <div style={{ backgroundColor: '#09090b', color: '#f4f4f5', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── SEO metadata ─────────────────────────────────────────────────────── */}
      <title>SpatialScribe — Your Spatial Workspace for Ideas, Notes and AI</title>
      <meta name="description" content="SpatialScribe combines a powerful block editor, infinite canvas, and AI assistant. Gather your scattered ideas onto one intelligent workspace. Free forever." />
      <meta name="keywords" content="spatial workspace, block editor, infinite canvas, AI notes, knowledge graph, note taking app" />
      <meta property="og:title" content="SpatialScribe — Your Spatial Workspace" />
      <meta property="og:description" content="Block editor + infinite canvas + AI assistant. All in one workspace. Free forever." />
      <meta property="og:type" content="website" />

      {/* ── Styles ───────────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes lp-glow  { 0%,100%{opacity:.3} 50%{opacity:.7} }
        @keyframes lp-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes lp-pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(124,58,237,0.35); }
          70%  { box-shadow: 0 0 0 12px rgba(124,58,237,0); }
          100% { box-shadow: 0 0 0 0 rgba(124,58,237,0); }
        }

        .lp-glow  { animation: lp-glow  4s ease-in-out infinite; }
        .lp-float { animation: lp-float 6s ease-in-out infinite; }

        .lp-btn-primary {
          background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);
          transition: transform .15s, box-shadow .15s;
        }
        .lp-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 28px rgba(124,58,237,.55);
        }
        .lp-btn-ghost {
          border: 1px solid rgba(124,58,237,.4);
          transition: border-color .15s, background .15s;
        }
        .lp-btn-ghost:hover {
          border-color: rgba(124,58,237,.8);
          background: rgba(124,58,237,.08);
        }
        .lp-card {
          transition: border-color .25s, transform .25s, box-shadow .25s;
        }
        .lp-card:hover {
          border-color: rgba(124,58,237,.45) !important;
          transform: translateY(-4px);
          box-shadow: 0 16px 48px rgba(0,0,0,.35);
        }
        .lp-pricing-card {
          transition: transform .25s, box-shadow .25s;
        }
        .lp-pricing-card:hover { transform: translateY(-5px); }

        .lp-gradient-text {
          background: linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .lp-cyan-text {
          background: linear-gradient(135deg, #06b6d4 0%, #38bdf8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* Scroll-reveal */
        [data-reveal] {
          opacity: 0;
          transform: translateY(28px);
          transition: opacity .65s ease-out, transform .65s ease-out;
        }
        [data-reveal].revealed          { opacity:1; transform:translateY(0); }
        [data-reveal][data-delay="100"] { transition-delay:.10s; }
        [data-reveal][data-delay="200"] { transition-delay:.20s; }
        [data-reveal][data-delay="300"] { transition-delay:.30s; }
        [data-reveal][data-delay="400"] { transition-delay:.40s; }
        [data-reveal][data-delay="500"] { transition-delay:.50s; }

        /* Strikethrough tags */
        .lp-tag-strike {
          padding: 5px 13px;
          border-radius: 100px;
          border: 1px solid rgba(255,255,255,.08);
          font-size: 13px;
          color: #52525b;
          text-decoration: line-through;
          display: inline-block;
        }
        .lp-tag-winner {
          padding: 5px 15px;
          border-radius: 100px;
          background: linear-gradient(135deg,rgba(124,58,237,.18),rgba(6,182,212,.10));
          border: 1px solid rgba(124,58,237,.35);
          font-size: 13px;
          color: #a855f7;
          font-weight: 600;
          display: inline-block;
        }

        @media (max-width: 640px) {
          .lp-hide-mobile { display: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-reveal], .lp-glow, .lp-float {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            transition: none !important;
          }
        }
      `}</style>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          NAVBAR
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header>
        <nav
          aria-label="Main navigation"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
            borderBottom:    scrolled ? '1px solid rgba(255,255,255,.06)' : '1px solid transparent',
            backgroundColor: scrolled ? 'rgba(9,9,11,.9)' : 'transparent',
            backdropFilter:  scrolled ? 'blur(20px)' : 'none',
            transition: 'all .3s',
          }}
        >
          <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

            <button
              onClick={() => router.push('/')}
              aria-label="SpatialScribe home"
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', padding: 0 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="SpatialScribe logo" style={{ height: '32px', width: 'auto', flexShrink: 0 }} />
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.02em' }}>SpatialScribe</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {[
                { label: 'Features',     id: 'features' },
                { label: 'How it works', id: 'how' },
                { label: 'Pricing',      id: 'pricing' },
              ].map(({ label, id }) => (
                <button
                  key={id}
                  className="lp-hide-mobile"
                  onClick={() => scrollTo(id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#71717a', fontSize: '14px', padding: '6px 12px', transition: 'color .15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#f4f4f5'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#71717a'; }}
                >
                  {label}
                </button>
              ))}
              <button onClick={() => router.push('/login')} className="lp-btn-ghost"
                style={{ padding: '7px 16px', borderRadius: '8px', cursor: 'pointer', color: '#e4e4e7', fontSize: '14px', fontWeight: 500, backgroundColor: 'transparent' }}>
                Log in
              </button>
              <button onClick={() => router.push('/register')} className="lp-btn-primary"
                style={{ padding: '7px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                Get started
              </button>
            </div>
          </div>
        </nav>
      </header>

      <main>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            HERO
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section
          aria-labelledby="hero-headline"
          style={{
            position: 'relative', minHeight: '100vh',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            paddingTop: '80px', paddingBottom: '60px',
            paddingLeft: '24px', paddingRight: '24px',
            background: 'linear-gradient(160deg, #1e2d5a 0%, #1e3a5f 28%, #0f172a 58%, #09090b 100%)',
          }}
        >
          {/* Ambient orbs */}
          <div className="lp-glow" aria-hidden style={{ position: 'absolute', top: '10%', left: '5%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.13) 0%, transparent 65%)', pointerEvents: 'none' }} />
          <div className="lp-glow" aria-hidden style={{ position: 'absolute', bottom: '10%', right: '5%', width: '380px', height: '380px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,.09) 0%, transparent 65%)', pointerEvents: 'none', animationDelay: '2s' }} />

          <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', maxWidth: '860px', width: '100%' }}>

            {/* Floating logo */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="SpatialScribe"
              className="animate-fade-in-up lp-float"
              style={{ height: '72px', width: 'auto', margin: '0 auto 28px', display: 'block' }}
            />

            {/* Badge */}
            <div className="animate-fade-in-up" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 14px', borderRadius: '100px', border: '1px solid rgba(124,58,237,.3)', backgroundColor: 'rgba(124,58,237,.06)', marginBottom: '32px', fontSize: '12px', color: '#a855f7', letterSpacing: '.08em' }}>
              <span aria-hidden>✦</span>
              <span>Spatial workspace for thinkers</span>
            </div>

            {/* H1 */}
            <h1 id="hero-headline" className="animate-fade-in-up animate-delay-100" style={{ fontSize: 'clamp(40px, 8vw, 90px)', fontWeight: 800, lineHeight: 1.04, letterSpacing: '-.03em', marginBottom: '24px' }}>
              <span style={{ display: 'block', color: '#f4f4f5' }}>Your Ideas,</span>
              <span style={{ display: 'block' }} className="lp-gradient-text">Spatially Organized</span>
            </h1>

            {/* Sub */}
            <p className="animate-fade-in-up animate-delay-200" style={{ fontSize: 'clamp(16px, 2.2vw, 20px)', color: '#94a3b8', maxWidth: '560px', margin: '0 auto 44px', lineHeight: 1.8 }}>
              SpatialScribe combines a powerful block editor, infinite canvas, and AI assistant — all in one workspace.
            </p>

            {/* CTAs */}
            <div className="animate-fade-in-up animate-delay-300" style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => router.push('/register')} className="lp-btn-primary"
                style={{ padding: '14px 34px', borderRadius: '10px', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '16px', fontWeight: 700 }}>
                Start for free →
              </button>
              <button onClick={() => router.push('/login')} className="lp-btn-ghost"
                style={{ padding: '14px 28px', borderRadius: '10px', cursor: 'pointer', color: '#e4e4e7', fontSize: '16px', fontWeight: 500, backgroundColor: 'transparent' }}>
                Log in
              </button>
            </div>

            <p className="animate-fade-in-up animate-delay-400" style={{ marginTop: '20px', fontSize: '13px', color: '#52525b' }}>
              Free forever · No credit card required
            </p>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            SCREENSHOTS — See it in action
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section aria-label="App screenshots" style={{ padding: '0 24px 80px', maxWidth: '1120px', margin: '0 auto' }}>
          <p data-reveal style={{ textAlign: 'center', fontSize: '11px', color: '#52525b', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '32px' }}>
            See it in action
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            <figure data-reveal data-delay="100" style={{ margin: 0, borderRadius: '16px', border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,.55)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/screenshot-canvas.png" alt="SpatialScribe infinite canvas — drag, connect and map your ideas visually" style={{ width: '100%', height: '192px', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
              <figcaption style={{ padding: '12px 16px', background: 'rgba(255,255,255,.02)', borderTop: '1px solid rgba(255,255,255,.05)', fontSize: '13px', fontWeight: 500, color: '#71717a' }}>
                Infinite Canvas
              </figcaption>
            </figure>
            <figure data-reveal data-delay="200" style={{ margin: 0, borderRadius: '16px', border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,.55)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/screenshot-graph.png" alt="SpatialScribe knowledge graph — visualize connections between all your pages" style={{ width: '100%', height: '192px', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
              <figcaption style={{ padding: '12px 16px', background: 'rgba(255,255,255,.02)', borderTop: '1px solid rgba(255,255,255,.05)', fontSize: '13px', fontWeight: 500, color: '#71717a' }}>
                Knowledge Graph
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            PROBLEM STATEMENT — The scattered-apps pain point
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section
          aria-labelledby="problem-headline"
          style={{ padding: '96px 24px', borderTop: '1px solid rgba(255,255,255,.04)', background: 'linear-gradient(180deg, rgba(30,45,90,.18) 0%, transparent 100%)' }}
        >
          <div style={{ maxWidth: '820px', margin: '0 auto' }}>
            <div data-reveal style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{ width: '32px', height: '1px', background: '#7c3aed' }} aria-hidden />
              <span style={{ fontSize: '11px', color: '#7c3aed', letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600 }}>The problem</span>
            </div>

            <h2 id="problem-headline" data-reveal data-delay="100" style={{ fontSize: 'clamp(26px, 4.5vw, 48px)', fontWeight: 800, lineHeight: 1.12, letterSpacing: '-.025em', color: '#f4f4f5', marginBottom: '28px' }}>
              Your best ideas are scattered across<br />
              <span className="lp-gradient-text">six apps and a dozen sticky notes.</span>
            </h2>

            <p data-reveal data-delay="200" style={{ fontSize: 'clamp(15px, 1.8vw, 19px)', color: '#94a3b8', lineHeight: 1.85, maxWidth: '640px', marginBottom: '44px' }}>
              SpatialScribe gathers them onto a single, infinite canvas. Your AI agents handle the sorting.{' '}
              <strong style={{ color: '#f4f4f5', fontWeight: 700 }}>You just think.</strong>
            </p>

            {/* Strikethrough tags */}
            <div data-reveal data-delay="300" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              {APP_TAGS.map((app) => (
                <span key={app} className="lp-tag-strike" aria-label={`replacing ${app}`}>{app}</span>
              ))}
              <span aria-hidden style={{ color: '#52525b', fontSize: '18px' }}>→</span>
              <span className="lp-tag-winner">SpatialScribe ✦</span>
            </div>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            FEATURES GRID
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section id="features" aria-labelledby="features-headline" style={{ padding: '96px 24px', maxWidth: '1120px', margin: '0 auto' }}>
          <div data-reveal style={{ textAlign: 'center', marginBottom: '64px' }}>
            <h2 id="features-headline" style={{ fontSize: 'clamp(28px, 4.5vw, 48px)', fontWeight: 700, letterSpacing: '-.02em', color: '#f4f4f5', marginBottom: '12px' }}>
              Everything in one place
            </h2>
            <p style={{ fontSize: '16px', color: '#71717a' }}>No tabs, no context switching — just your workspace.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {FEATURES.map((feat, i) => (
              <article
                key={feat.title}
                data-reveal
                data-delay={String(Math.min((i + 1) * 100, 500))}
                className="lp-card"
                style={{ padding: '28px', borderRadius: '14px', border: '1px solid rgba(255,255,255,.06)', backgroundColor: 'rgba(255,255,255,.015)', position: 'relative', overflow: 'hidden' }}
              >
                <div style={{ fontSize: '30px', lineHeight: 1, marginBottom: '14px' }} aria-hidden>{feat.icon}</div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f4f4f5', marginBottom: '8px' }}>{feat.title}</h3>
                <p style={{ fontSize: '14px', color: '#71717a', lineHeight: 1.65 }}>{feat.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            AI COLLABORATOR
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section
          aria-labelledby="ai-headline"
          style={{ padding: '96px 24px', borderTop: '1px solid rgba(255,255,255,.04)', borderBottom: '1px solid rgba(255,255,255,.04)', background: 'linear-gradient(135deg, rgba(124,58,237,.07) 0%, rgba(6,182,212,.035) 100%)' }}
        >
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div data-reveal style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{ width: '32px', height: '1px', background: '#06b6d4' }} aria-hidden />
              <span style={{ fontSize: '11px', color: '#06b6d4', letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600 }}>AI Collaboration</span>
            </div>

            <h2 id="ai-headline" data-reveal data-delay="100" style={{ fontSize: 'clamp(26px, 4.5vw, 50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', color: '#f4f4f5', marginBottom: '28px' }}>
              SpatialScribe isn&apos;t a passive tool.<br />
              <span className="lp-cyan-text">It&apos;s an active collaborator.</span>
            </h2>

            <p data-reveal data-delay="200" style={{ fontSize: 'clamp(15px, 1.8vw, 19px)', color: '#94a3b8', lineHeight: 1.85, maxWidth: '680px', marginBottom: '48px' }}>
              Drop in your research, your journal, or your wildest brainstorm. Watch as AI agents illuminate the hidden threads,
              summarize the noise, and help you build something{' '}
              <strong style={{ color: '#f4f4f5', fontWeight: 700 }}>smarter than you could alone.</strong>
            </p>

            <div data-reveal data-delay="300" style={{ display: 'flex', flexWrap: 'wrap', gap: '32px' }}>
              {[
                { icon: '🔍', label: 'Illuminate hidden threads' },
                { icon: '✂️', label: 'Summarize the noise' },
                { icon: '🧠', label: 'Build something smarter' },
              ].map(({ icon, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '22px' }} aria-hidden>{icon}</span>
                  <span style={{ fontSize: '15px', color: '#a1a1aa', fontWeight: 500 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            HOW IT WORKS
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section id="how" aria-labelledby="how-headline" style={{ padding: '96px 24px', background: 'linear-gradient(180deg, transparent 0%, rgba(124,58,237,.03) 50%, transparent 100%)' }}>
          <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
            <div data-reveal style={{ textAlign: 'center', marginBottom: '72px' }}>
              <h2 id="how-headline" style={{ fontSize: 'clamp(28px, 4.5vw, 48px)', fontWeight: 700, letterSpacing: '-.02em', color: '#f4f4f5' }}>
                How it works
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '48px' }}>
              {HOW_STEPS.map((step, i) => (
                <div key={step.num} data-reveal data-delay={String((i + 1) * 100)} style={{ position: 'relative' }}>
                  <div aria-hidden style={{ fontFamily: 'monospace', fontSize: '120px', fontWeight: 800, color: 'rgba(255,255,255,.025)', position: 'absolute', top: '-20px', left: '-10px', lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>
                    {step.num}
                  </div>
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#7c3aed', letterSpacing: '.1em', marginBottom: '12px' }}>{step.num}</div>
                    <h3 style={{ fontSize: '26px', fontWeight: 700, color: '#f4f4f5', marginBottom: '10px', letterSpacing: '-.02em' }}>{step.title}</h3>
                    <p style={{ fontSize: '15px', color: '#71717a', lineHeight: 1.75 }}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            SPATIAL THINKING — non-linear brain copy
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section
          aria-labelledby="spatial-headline"
          style={{ padding: '96px 24px', borderTop: '1px solid rgba(255,255,255,.04)', background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(30,45,90,.22) 0%, transparent 70%)' }}
        >
          <div style={{ maxWidth: '760px', margin: '0 auto', textAlign: 'center' }}>
            <div data-reveal style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <span style={{ fontSize: '11px', color: '#06b6d4', letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600 }}>Spatial Thinking</span>
            </div>

            <h2 id="spatial-headline" data-reveal data-delay="100" style={{ fontSize: 'clamp(26px, 4.5vw, 52px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.03em', color: '#f4f4f5', marginBottom: '28px' }}>
              Your brain doesn&apos;t work in a straight line.{' '}
              <span className="lp-gradient-text">Why should your notes?</span>
            </h2>

            <p data-reveal data-delay="200" style={{ fontSize: 'clamp(15px, 1.8vw, 19px)', color: '#94a3b8', lineHeight: 1.85, marginBottom: '20px' }}>
              SpatialScribe gives you an infinite canvas to map, sketch, and connect ideas exactly where they belong.
            </p>
            <p data-reveal data-delay="250" style={{ fontSize: 'clamp(15px, 1.8vw, 19px)', color: '#94a3b8', lineHeight: 1.85, marginBottom: '48px' }}>
              It&apos;s the spatial freedom of a whiteboard with the intelligence of the cloud.
            </p>

            <div data-reveal data-delay="300">
              <button onClick={() => router.push('/register')} className="lp-btn-primary"
                style={{ padding: '14px 32px', borderRadius: '10px', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '15px', fontWeight: 700 }}>
                Try it free →
              </button>
            </div>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            PRICING
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section id="pricing" aria-labelledby="pricing-headline" style={{ padding: '96px 24px', maxWidth: '1120px', margin: '0 auto' }}>
          <div data-reveal style={{ textAlign: 'center', marginBottom: '64px' }}>
            <h2 id="pricing-headline" style={{ fontSize: 'clamp(28px, 4.5vw, 48px)', fontWeight: 700, letterSpacing: '-.02em', color: '#f4f4f5', marginBottom: '12px' }}>
              Simple, transparent pricing
            </h2>
            <p style={{ fontSize: '16px', color: '#71717a' }}>Start free. Upgrade when you&apos;re ready. No surprises.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'start' }}>
            {PLANS.map((plan, i) => (
              <div
                key={plan.name}
                data-reveal
                data-delay={String((i + 1) * 100)}
                className="lp-pricing-card"
                style={{
                  padding: '32px',
                  borderRadius: '18px',
                  border:           plan.highlight ? '1px solid rgba(124,58,237,.55)' : '1px solid rgba(255,255,255,.07)',
                  backgroundColor:  plan.highlight ? 'rgba(124,58,237,.08)' : 'rgba(255,255,255,.015)',
                  boxShadow:        plan.highlight ? '0 0 48px rgba(124,58,237,.18)' : 'none',
                  position: 'relative',
                }}
              >
                {/* Badge */}
                <div style={{ marginBottom: '24px' }}>
                  <span style={{
                    display: 'inline-block', padding: '3px 11px', borderRadius: '100px',
                    fontSize: '11px', fontWeight: 600, letterSpacing: '.05em',
                    background: plan.highlight ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'rgba(255,255,255,.06)',
                    color: plan.highlight ? '#fff' : '#71717a',
                  }}>
                    {plan.badge}
                  </span>
                </div>

                {/* Plan name + price */}
                <div style={{ marginBottom: '28px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#a1a1aa', marginBottom: '8px' }}>{plan.name}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '44px', fontWeight: 800, color: '#f4f4f5', letterSpacing: '-.03em', lineHeight: 1 }}>{plan.price}</span>
                    {plan.period && <span style={{ fontSize: '14px', color: '#71717a' }}>/ {plan.period}</span>}
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={() => handlePlanClick(plan.href)}
                  className={plan.highlight ? 'lp-btn-primary' : 'lp-btn-ghost'}
                  style={{
                    width: '100%', padding: '11px', borderRadius: '9px', cursor: 'pointer',
                    color: plan.highlight ? '#fff' : '#e4e4e7',
                    fontSize: '14px', fontWeight: 600, marginBottom: '28px',
                    border: plan.highlight ? 'none' : '1px solid rgba(124,58,237,.4)',
                    backgroundColor: plan.highlight ? undefined : 'transparent',
                    display: 'block',
                  }}
                >
                  {plan.cta}
                </button>

                {/* Features list */}
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {plan.features.map((feat) => (
                    <li key={feat} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', color: '#a1a1aa', lineHeight: 1.5 }}>
                      <span style={{ color: '#7c3aed', flexShrink: 0, marginTop: '1px', fontWeight: 700 }} aria-hidden>✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p data-reveal style={{ textAlign: 'center', marginTop: '40px', fontSize: '13px', color: '#52525b' }}>
            All plans include the core block editor, canvas, and knowledge graph.{' '}
            <strong style={{ color: '#71717a' }}>Free plan is free forever</strong> — no credit card required.
          </p>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            FOOTER CTA
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section
          aria-label="Call to action"
          style={{ padding: '100px 24px', textAlign: 'center', background: 'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,.13) 0%, transparent 65%)' }}
        >
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            <h2 data-reveal style={{ fontSize: 'clamp(28px, 5vw, 58px)', fontWeight: 800, letterSpacing: '-.03em', color: '#f4f4f5', marginBottom: '16px', lineHeight: 1.08 }}>
              Start thinking spatially.
            </h2>
            <p data-reveal data-delay="100" style={{ fontSize: '17px', color: '#71717a', marginBottom: '40px' }}>
              Join builders and thinkers who organize their ideas the way their brain actually works.
            </p>
            <div data-reveal data-delay="200" style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => router.push('/register')} className="lp-btn-primary"
                style={{ padding: '16px 42px', borderRadius: '12px', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '17px', fontWeight: 700 }}>
                Start for free →
              </button>
              <button onClick={() => router.push('/login')} className="lp-btn-ghost"
                style={{ padding: '16px 32px', borderRadius: '12px', cursor: 'pointer', color: '#e4e4e7', fontSize: '17px', fontWeight: 500, backgroundColor: 'transparent' }}>
                Log in
              </button>
            </div>
            <p data-reveal data-delay="300" style={{ marginTop: '18px', fontSize: '13px', color: '#52525b' }}>
              Free forever · No credit card required
            </p>
          </div>
        </section>

      </main>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          FOOTER
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer aria-label="Site footer" style={{ borderTop: '1px solid rgba(255,255,255,.06)', padding: '36px 24px' }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="SpatialScribe" style={{ height: '22px', width: 'auto' }} />
            <span style={{ fontSize: '14px', color: '#52525b' }}>SpatialScribe — Built for thinkers.</span>
          </div>
          <nav aria-label="Footer navigation" style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <Link href="/login"    style={{ fontSize: '13px', color: '#52525b', textDecoration: 'none' }}>Log in</Link>
            <Link href="/register" style={{ fontSize: '13px', color: '#52525b', textDecoration: 'none' }}>Sign up</Link>
            <span style={{ fontSize: '13px', color: '#3f3f46' }}>&copy; {new Date().getFullYear()} SpatialScribe</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
