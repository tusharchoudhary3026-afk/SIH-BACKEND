import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, Variants } from 'framer-motion';
import { 
  Layers, 
  ShieldCheck, 
  Activity, 
  Fingerprint,
  Scan,
  Sparkles,
  ArrowRight, 
  CheckCircle2,
  Network
} from 'lucide-react';
import { scrollToSection } from '../utils/smoothScroll';

// Static card data — defined outside component to avoid re-creation on every render (OPT-4)
// Motion variants hoisted outside component since they contain no dynamic values (OPT-4f)
const fadeUpVariant: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: 'easeOut' }
  }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1
    }
  }
};

const coreCards = [
  {
    id: 'ela',
    title: 'Error Level Analysis (ELA)',
    desc: 'Highlights compression artifacts. Measures differences in JPEG compression error rates across high-frequency boundaries to surface modified regions.',
    badge: 'Quantization matrix differential',
    icon: Layers,
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/10 border-orange-500/25',
    glowColor: 'hover:border-orange-500/50 hover:shadow-[0_0_30px_rgba(249,115,22,0.2)]',
    accentDot: 'bg-orange-400'
  },
  {
    id: 'metadata',
    title: 'Metadata & C2PA Extraction',
    desc: 'Verifies digital provenance. Inspects cryptographic Content Credentials manifests, EXIF headers, camera hardware serials, and timestamps.',
    badge: 'Cryptographic manifest validation',
    icon: ShieldCheck,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10 border-emerald-500/25',
    glowColor: 'hover:border-emerald-500/50 hover:shadow-[0_0_30px_rgba(16,185,129,0.2)]',
    accentDot: 'bg-emerald-400'
  },
  {
    id: 'frequency',
    title: 'Frequency & Noise Analysis',
    desc: 'Detects GAN/Diffusion artifacts. Applies 2D Discrete Fourier Transforms (DFT) and Laplacian noise variance to uncover generative upsampling grids.',
    badge: '2D Fourier spectral peak detection',
    icon: Activity,
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/10 border-purple-500/25',
    glowColor: 'hover:border-purple-500/50 hover:shadow-[0_0_30px_rgba(168,85,247,0.2)]',
    accentDot: 'bg-purple-400'
  },
  {
    id: 'prnu',
    title: 'PRNU Sensor Fingerprinting',
    desc: 'Extracts Photo-Response Non-Uniformity unique to physical camera silicon. Uncovers sensor imperfections and flags spliced regions missing authentic sensor noise.',
    badge: 'Silicon noise fingerprint matching',
    icon: Fingerprint,
    iconColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/10 border-cyan-500/25',
    glowColor: 'hover:border-cyan-500/50 hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]',
    accentDot: 'bg-cyan-400'
  },
  {
    id: 'cfa',
    title: 'CFA & Demosaicing Forensics',
    desc: 'Analyzes Color Filter Array (Bayer pattern) interpolation anomalies. Surfaces broken demosaicing traces left when generative elements or faces are spliced.',
    badge: 'Bayer interpolation variance',
    icon: Scan,
    iconColor: 'text-rose-400',
    iconBg: 'bg-rose-500/10 border-rose-500/25',
    glowColor: 'hover:border-rose-500/50 hover:shadow-[0_0_30px_rgba(244,63,94,0.2)]',
    accentDot: 'bg-rose-400'
  },
  {
    id: 'diffusion',
    title: 'Neural Diffusion & Deepfake Classifier',
    desc: 'Applies fine-tuned vision transformers and latent diffusion classifiers to recognize synthetic boundary feathering, generative noise schedules, and deepfake swaps.',
    badge: 'Vision transformer feature extraction',
    icon: Sparkles,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10 border-amber-500/25',
    glowColor: 'hover:border-amber-500/50 hover:shadow-[0_0_30px_rgba(245,158,11,0.2)]',
    accentDot: 'bg-amber-400'
  }
];

// Duplicate cards for seamless continuous infinite looping
const marqueeCards = [...coreCards, ...coreCards];

export const Home: React.FC = () => {
  const location = useLocation();

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    scrollToSection(id);
  };

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      setTimeout(() => {
        scrollToSection(id);
      }, 150);
    }
  }, [location]);

  return (
    <div className="w-full bg-[#090A0E] min-h-screen text-gray-100 selection:bg-orange-600 selection:text-white">
      {/* ========================================================================= */}
      {/* 1. HERO SECTION WITH DEFAULT ROBOT BACKGROUND & SIDEWISE TEXT             */}
      {/* ========================================================================= */}
      <section className="relative min-h-screen w-full overflow-hidden bg-[#090A0E] flex flex-col justify-between px-4 sm:px-8 lg:px-10 py-5 sm:py-8 selection:bg-orange-600 selection:text-white">
        {/* Fullscreen Background Video (Default robot hand video preserved) */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-85"
        >
          <source src="/videos/robot_hero.mp4" type="video/mp4" />
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_215831_c6a8989c-d716-4d8d-8745-e972a2eec711.mp4"
            type="video/mp4"
          />
          Your browser does not support the video tag.
        </video>

        {/* Ambient Dark Gradient Overlay (Default styling) */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090A0E] via-black/40 to-black/60 pointer-events-none" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.08),transparent_65%)]" />

        {/* ========================================================================= */}
        {/* TOP NAVBAR: RIGHT PILL                                                    */}
        {/* ========================================================================= */}
        <header className="relative z-30 w-full flex items-center justify-end pointer-events-auto">
          <motion.nav
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl px-8 py-3 bg-[#151824]/90 backdrop-blur-md border border-white/15 shadow-xl flex items-center gap-7"
          >
            <Link
              to="/graph"
              className="text-[14px] font-semibold text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1.5"
            >
              <Network className="w-3.5 h-3.5" />
              <span>Fraud Graph</span>
            </Link>
            <a
              href="#technology"
              onClick={(e) => handleNavClick(e, 'technology')}
              className="text-[14px] font-medium text-gray-300 hover:text-white transition-colors cursor-pointer"
            >
              Technology
            </a>
            <a
              href="#documentation"
              onClick={(e) => handleNavClick(e, 'documentation')}
              className="text-[14px] font-medium text-gray-300 hover:text-white transition-colors cursor-pointer"
            >
              Documentation
            </a>
            <a
              href="#api"
              onClick={(e) => handleNavClick(e, 'api')}
              className="text-[14px] font-medium text-gray-300 hover:text-white transition-colors cursor-pointer"
            >
              API
            </a>
          </motion.nav>
        </header>

        {/* ========================================================================= */}
        {/* MIDDLE LAYER (z-10): SIDEWISE HERO CONTENT (SLIM & CLOSE TO SCREEN SIDES)  */}
        {/* ========================================================================= */}
        <div className="relative z-10 my-auto w-full py-4 pointer-events-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center min-h-[460px] w-full">
            {/* LEFT SIDEWISE WING: Primary headline, subtext, and CTA */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-4 xl:col-span-4 flex flex-col items-start text-left space-y-4 pl-1 sm:pl-2"
            >
              {/* Top Badge */}
              <div className="inline-block pointer-events-auto">
                <Link
                  to="/analyze"
                  className="group inline-flex items-center gap-2 text-xs sm:text-[13px] font-medium text-orange-400 bg-[#151824]/80 backdrop-blur-md border border-orange-500/35 px-4 py-1.5 rounded-full hover:bg-orange-500/15 hover:border-orange-500/50 transition-all shadow-[0_0_20px_rgba(249,115,22,0.15)]"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                  <span>Powered by Multi-Model Forensics</span>
                  <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
                </Link>
              </div>

              {/* Main Headline - Increased size slightly */}
              <h1 className="text-3xl sm:text-4xl md:text-[2.75rem] lg:text-[2.95rem] font-bold tracking-tight text-white leading-[1.15] drop-shadow-xl">
                Advanced AI <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-200 to-orange-500 drop-shadow-[0_0_25px_rgba(249,115,22,0.25)]">
                  image forensics.
                </span>
              </h1>

              {/* Subtext - Increased size slightly */}
              <p className="text-sm sm:text-[15px] text-gray-300 font-normal leading-relaxed max-w-md drop-shadow">
                Detect deepfakes, synthetic generation, and image manipulation instantly across spectral and spatial domains.
              </p>

              {/* CTA Button */}
              <div className="pt-1.5 pointer-events-auto">
                <Link
                  to="/analyze"
                  className="inline-flex items-center gap-2.5 text-sm sm:text-base font-semibold text-white border border-orange-500/70 rounded-full px-7 py-3 hover:bg-orange-600 hover:border-orange-400 hover:shadow-[0_0_20px_rgba(249,115,22,0.35),0_0_35px_rgba(234,88,12,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 group bg-orange-600/20 backdrop-blur-md shadow-lg shadow-orange-600/15"
                >
                  <span>Upload Image</span>
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </div>
            </motion.div>

            {/* WIDE CENTER CORRIDOR (lg:col-span-4): Generous breathing room for the robot hand */}
            <div className="hidden lg:block lg:col-span-4 xl:col-span-4 pointer-events-none" />

            {/* RIGHT SIDEWISE WING: Secondary headline & compact telemetry HUD cards */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-4 xl:col-span-4 flex flex-col items-start lg:items-end text-left lg:text-right space-y-4 pr-1 sm:pr-2"
            >
              {/* Secondary Headline */}
              <div className="space-y-1">
                <span className="text-xs font-mono uppercase tracking-widest text-orange-400/90 font-semibold block">
                  TRUTH VERIFICATION ENGINE
                </span>
                <h2 className="text-2xl sm:text-3xl md:text-[2.1rem] lg:text-[2.25rem] font-bold text-white tracking-tight leading-snug">
                  Built for the <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-orange-400 to-amber-300">
                    truth seekers.
                  </span>
                </h2>
              </div>

              {/* Forensics Telemetry Cards Stack */}
              <div className="space-y-3 w-full max-w-[340px] ml-auto">
                {/* Card 1: ELA */}
                <div className="p-3 sm:p-3.5 rounded-xl bg-[#151824]/75 backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-between hover:border-orange-500/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="text-xs sm:text-[13px] font-semibold text-white">Error Level Analysis</div>
                      <div className="text-[11px] text-gray-400">Quantization delta check</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded">
                    &lt; 8.4%
                  </span>
                </div>

                {/* Card 2: 2D FFT */}
                <div className="p-3 sm:p-3.5 rounded-xl bg-[#151824]/75 backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-between hover:border-purple-500/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="text-xs sm:text-[13px] font-semibold text-white">2D FFT Spectral Grid</div>
                      <div className="text-[11px] text-gray-400">Diffusion noise variance</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/25 px-2 py-0.5 rounded">
                    99.4% Match
                  </span>
                </div>

                {/* Card 3: C2PA */}
                <div className="p-3 sm:p-3.5 rounded-xl bg-[#151824]/75 backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-between hover:border-emerald-500/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="text-xs sm:text-[13px] font-semibold text-white">C2PA Content Credentials</div>
                      <div className="text-[11px] text-gray-400">Provenance chain</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded">
                    VERIFIED
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Bottom spacing spacer */}
        <div className="relative z-10 w-full h-4 pointer-events-none" />
      </section>

      {/* ========================================================================= */}
      {/* 2. SCROLL REVEAL: CONTINUOUS ROTATING INFINITE CAROUSEL                   */}
      {/* ========================================================================= */}
      <section id="technology" className="py-24 bg-[#0E1017] scroll-mt-6 overflow-hidden relative">
        {/* Transition zone: smooth gradient blend from Hero bg (#090A0E) to Technology bg (#0E1017) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-[#090A0E] to-[#0E1017] z-0" />
        
        {/* Upper-left gray radial glow echoing Hero video tone */}
        <div className="pointer-events-none absolute -top-10 left-0 w-[500px] h-[400px] bg-[radial-gradient(ellipse_at_top_left,rgba(120,120,120,0.15),transparent_70%)] z-0" />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-70px' }}
          variants={fadeUpVariant}
          className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 mb-12"
        >
          {/* Section Header */}
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs uppercase tracking-wider font-semibold text-orange-400 bg-orange-500/10 px-3.5 py-1.5 rounded-full border border-orange-500/30 font-mono">
              Core Inspection Engine
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-4 mb-4 tracking-tight">
              Multi-Layer Forensics Pipeline
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Every analyzed image undergoes rigorous multi-domain signal processing, pixel-level error estimation, and cryptographic provenance checks.
            </p>
          </div>
        </motion.div>

        {/* Infinite Moving Marquee Track (42s Crisp Glide) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative w-full overflow-hidden py-4"
        >
          {/* Left Gradient Fade Mask */}
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-24 sm:w-40 bg-gradient-to-r from-[#0E1017] via-[#0E1017]/80 to-transparent z-20" />
          
          {/* Right Gradient Fade Mask */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 sm:w-40 bg-gradient-to-l from-[#0E1017] via-[#0E1017]/80 to-transparent z-20" />

          {/* Marquee Animation Strip */}
          <div className="animate-marquee-infinite flex items-stretch gap-6 pl-6 cursor-grab active:cursor-grabbing">
            {marqueeCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <div
                  key={`${card.id}-${index}`}
                  className={`w-[340px] sm:w-[390px] shrink-0 bg-[#151824] rounded-3xl p-8 border border-white/10 shadow-xl ${card.glowColor} transition-all duration-300 flex flex-col justify-between group select-none`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div className={`w-12 h-12 rounded-2xl ${card.iconBg} border flex items-center justify-center ${card.iconColor} group-hover:scale-110 transition-transform duration-200 shadow-md`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-gray-400 bg-white/5 border border-white/5 px-2.5 py-1 rounded-full uppercase tracking-wider">
                        SIGNAL {String((index % coreCards.length) + 1).padStart(2, '0')}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-white mb-2.5 group-hover:text-orange-400 transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-400 leading-relaxed mb-6">
                      {card.desc}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-white/5 flex items-center gap-2 text-xs font-medium text-gray-300">
                    <span className={`w-2 h-2 rounded-full ${card.accentDot} animate-pulse`} />
                    <span className="font-mono text-[11px] text-gray-400">{card.badge}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Subtle Hint */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="relative z-10 text-center mt-6 text-xs text-gray-500 font-mono"
        >
          <span>← Hover to pause continuous rotation • 6 Core Orthogonal Signals →</span>
        </motion.div>
      </section>

      {/* ========================================================================= */}
      {/* 3. SCROLL REVEAL: DETAILED ARCHITECTURE / WORKFLOW SECTION                */}
      {/* ========================================================================= */}
      <section id="documentation" className="py-20 px-6 sm:px-10 lg:px-16 bg-[#090A0E] scroll-mt-6 overflow-hidden relative">
        {/* Transition zone: smooth gradient blend from Technology bg (#0E1017) to Documentation bg (#090A0E) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-[#0E1017] to-[#090A0E] z-0" />

        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Staggered list */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-70px' }}
              variants={staggerContainer}
              className="lg:col-span-6 space-y-6"
            >
              <motion.div variants={fadeUpVariant} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>High-Precision Diagnostic Reliability</span>
              </motion.div>

              <motion.h2 variants={fadeUpVariant} className="text-3xl font-bold text-white tracking-tight">
                How our automated forensics engine surfaces synthetic manipulation
              </motion.h2>

              <motion.p variants={fadeUpVariant} className="text-sm text-gray-400 leading-relaxed">
                Modern AI generators like Flux, Midjourney v6, and Stable Diffusion XL leave microscopic frequency residuals and non-uniform noise distributions. Our platform correlates five orthogonal detection pipelines to produce an unambiguous forensic confidence score.
              </motion.p>
              
              <div className="space-y-4 pt-2">
                <motion.div variants={fadeUpVariant} className="flex items-start gap-4 p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0 font-bold text-xs font-mono">
                    01
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Pixel Ingestion & EXIF Extraction</h4>
                    <p className="text-xs text-gray-400 mt-1">Images are normalized in memory and stripped of unsafe binaries while verifying byte offsets.</p>
                  </div>
                </motion.div>

                <motion.div variants={fadeUpVariant} className="flex items-start gap-4 p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0 font-bold text-xs font-mono">
                    02
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Multi-Model Spatial & Spectral Passes</h4>
                    <p className="text-xs text-gray-400 mt-1">Concurrently runs ELA error delta, 2D FFT spectral transforms, and generative diffusion signatures.</p>
                  </div>
                </motion.div>

                <motion.div variants={fadeUpVariant} className="flex items-start gap-4 p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0 font-bold text-xs font-mono">
                    03
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Weighted Bayesian Aggregation</h4>
                    <p className="text-xs text-gray-400 mt-1">Correlates module predictions into a single, explainable verdict with individual metric breakdowns.</p>
                  </div>
                </motion.div>
              </div>

              <motion.div variants={fadeUpVariant} className="pt-4">
                <Link
                  to="/analyze"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-white border border-orange-500/70 bg-orange-600/20 backdrop-blur-md hover:bg-orange-600 hover:border-orange-500 hover:shadow-[0_0_15px_rgba(249,115,22,0.3),0_0_25px_rgba(234,88,12,0.15)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 group px-6 py-3 rounded-2xl shadow-lg shadow-orange-600/10"
                >
                  <span>Launch Deepfake Analyzer</span>
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </motion.div>
            </motion.div>

            {/* Right Column: Animated Terminal */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-70px' }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
              className="lg:col-span-6 bg-[#151824] rounded-3xl p-8 border border-white/10 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                  <span className="text-xs font-mono text-gray-400 ml-2">pipeline_inspector.log</span>
                </div>
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded">ONLINE</span>
              </div>

              <div className="space-y-4 font-mono text-xs">
                <div className="p-3.5 bg-[#0D0F16] rounded-2xl border border-white/5">
                  <div className="flex justify-between text-gray-400 mb-1">
                    <span>STAGE 1: INGESTION</span>
                    <span className="text-emerald-400">PASS</span>
                  </div>
                  <div className="text-white font-semibold">C2PA Manifest Check: Verified / Signature Validated</div>
                </div>

                <div className="p-3.5 bg-[#0D0F16] rounded-2xl border border-white/5">
                  <div className="flex justify-between text-gray-400 mb-1">
                    <span>STAGE 2: FREQUENCY TRANSFORM</span>
                    <span className="text-orange-400">PROCESSED</span>
                  </div>
                  <div className="text-white font-semibold">2D FFT Magnitude: Natural High-Frequency Falloff (94%)</div>
                </div>

                <div className="p-3.5 bg-[#0D0F16] rounded-2xl border border-white/5">
                  <div className="flex justify-between text-gray-400 mb-1">
                    <span>STAGE 3: ERROR LEVEL ANALYSIS</span>
                    <span className="text-orange-400">PROCESSED</span>
                  </div>
                  <div className="text-white font-semibold">Compression Resave Delta: &lt; 8.4% Variance</div>
                </div>

                <div className="p-4 bg-orange-950/40 border border-orange-500/30 text-white rounded-2xl">
                  <div className="text-xs text-orange-300 mb-1 font-mono">FINAL CONFIDENCE VERDICT</div>
                  <div className="text-sm font-bold text-emerald-400 flex items-center justify-between">
                    <span>Authentic Media (Low AI Probability)</span>
                    <span className="text-lg">94.8%</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. SCROLL REVEAL: API & DEVELOPER INTEGRATION SECTION                     */}
      {/* ========================================================================= */}
      <section id="api" className="py-20 px-6 sm:px-10 lg:px-16 bg-[#0E1017] scroll-mt-6 overflow-hidden relative">
        {/* Transition zone: smooth gradient blend from Documentation bg (#090A0E) to API bg (#0E1017) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-[#090A0E] to-[#0E1017] z-0" />

        <div className="relative z-10 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-70px' }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="bg-[#151824] rounded-3xl p-8 sm:p-12 border border-white/10 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8"
          >
            <div className="max-w-xl">
              <span className="text-xs uppercase tracking-wider font-semibold text-orange-400 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/30 font-mono">
                Developer API
              </span>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mt-4 mb-3">
                Integrate real-time deepfake detection into your pipeline
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed mb-6">
                Our scalable backend endpoints (e.g., <code className="bg-black/50 border border-white/10 px-2 py-0.5 rounded text-orange-300 text-xs font-mono">POST /api/v1/upload</code>) integrate securely into any KYC verification workflow, or media publishing system.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  to="/analyze"
                  className="inline-flex items-center gap-2 text-xs font-semibold text-white border border-orange-500/70 bg-orange-600/20 backdrop-blur-md hover:bg-orange-600 hover:border-orange-500 hover:shadow-[0_0_15px_rgba(249,115,22,0.3),0_0_25px_rgba(234,88,12,0.15)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 group px-5 py-2.5 rounded-full shadow-lg shadow-orange-600/10"
                >
                  <span>Try Web Demo</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <a
                  href="#technology"
                  onClick={(e) => handleNavClick(e, 'technology')}
                  className="text-xs font-medium text-gray-300 hover:text-white border border-white/20 rounded-full px-5 py-2.5 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  View Documentation
                </a>
              </div>
            </div>

            <div className="w-full md:w-auto shrink-0 font-mono text-xs bg-black text-gray-100 p-6 rounded-2xl border border-white/10 shadow-2xl min-w-[320px]">
              <div className="text-gray-500 mb-2">// cURL Upload Example</div>
              <div className="text-orange-400">curl -X POST \</div>
              <div className="text-emerald-400 pl-4">http://localhost:3001/api/v1/upload \</div>
              <div className="text-amber-300 pl-4">-F "file=@sample_photo.jpg"</div>
              <div className="mt-4 pt-3 border-t border-white/10 text-gray-500 flex justify-between">
                <span>Response time</span>
                <span className="text-emerald-400 font-semibold">~850ms</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 sm:px-10 bg-[#090A0E] text-center text-xs text-gray-500 relative overflow-hidden">
        {/* Transition zone: smooth gradient blend from API bg (#0E1017) to Footer bg (#090A0E) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#0E1017] to-[#090A0E] z-0" />

        <div className="relative z-10 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">AI Forensics</span>
            <span>— Advanced Multi-Model Detection Platform</span>
          </div>
          <p>© 2026 AI Image Forensics Lab. Built for truth seekers.</p>
        </div>
      </footer>
    </div>
  );
};
