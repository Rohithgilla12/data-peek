'use client'

import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Download, Sparkles, Command, Database, Terminal, Globe, Zap, Github } from "lucide-react";
import { HeroTerminal } from "./hero-terminal";
import { DataSubstrate } from "./data-substrate";
import { useRef } from "react";

export function HeroV2() {
  const containerRef = useRef<HTMLElement>(null!);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);

  return (
    <section
      ref={containerRef}
      className="relative min-h-[140vh] flex flex-col items-center justify-start overflow-hidden pt-32 pb-40"
    >
      {/* Dynamic Backgrounds */}
      <div className="absolute inset-0 grid-pattern opacity-40" />
      <div className="absolute inset-0 noise-overlay" />
      <DataSubstrate />

      {/* Floating Elements / Particle-like blobs */}
      <div
        className="absolute top-1/4 -left-32 w-[500px] h-[500px] rounded-full opacity-30 pointer-events-none animate-float"
        style={{
          background: "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)",
          filter: "blur(100px)",
        }}
      />
      <div
        className="absolute bottom-1/4 -right-32 w-[600px] h-[600px] rounded-full opacity-20 pointer-events-none animate-float"
        style={{
          background: "radial-gradient(circle, #a855f7 0%, transparent 70%)",
          filter: "blur(120px)",
          animationDelay: "2s"
        }}
      />

      <motion.div
        style={{ y, opacity, scale }}
        {...({ className: "relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 flex flex-col items-center text-center" } as any)}
      >
        {/* Release Video Style Choreography */}
        
        {/* 1. Globe Icon (The Lead) */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ 
            type: "spring", 
            damping: 12, 
            stiffness: 100,
            delay: 0.2
          }}
          className="relative mb-12"
        >
          <div className="absolute -inset-8 rounded-full bg-[--color-accent] opacity-30 blur-3xl" />
          <div className="relative w-24 h-20 rounded-2xl bg-white/[0.05] border border-white/20 flex items-center justify-center text-[--color-accent] shadow-2xl glass-card mx-auto">
            <Globe className="w-10 h-10" strokeWidth={1.5} />
          </div>
        </motion.div>

        {/* 2. Main Title (The Impact) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ 
            type: "spring",
            damping: 15,
            stiffness: 80,
            delay: 0.4
          }}
        >
          <h1
            className="text-6xl sm:text-8xl md:text-9xl lg:text-[10rem] font-bold tracking-tighter leading-[0.8] mb-10 text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            data-peek
          </h1>
        </motion.div>

        {/* 3. Subtitle (Matching video intro text) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
          className="text-base sm:text-xl md:text-2xl text-white max-w-3xl mb-12 leading-relaxed font-mono h-8"
        >
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/80 animate-gradient-x">
            Desktop meets web. Your SQL, everywhere.
          </span>
        </motion.div>

        {/* Action Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.2, ease: [0.16, 1, 0.3, 1] }}
          {...({ className: "flex flex-col sm:flex-row items-center justify-center gap-6 mb-24" } as any)}
        >
          <Button size="xl" className="group rounded-full px-10 shadow-2xl shadow-[--color-accent]/20 hover:shadow-[--color-accent]/40 transition-all duration-500" asChild>
            <Link href="/download">
              <Download className="w-5 h-5 group-hover:animate-bounce" />
              <span>Download Free</span>
              <div className="ml-2 px-1.5 py-0.5 rounded-md bg-white/20 text-[10px] font-bold">DMG</div>
            </Link>
          </Button>
          <Button variant="outline" size="xl" className="rounded-full px-10 border-white/20 hover:bg-white/10 transition-all group" asChild>
            <Link href="/#pricing">
              <span className="text-white">View Pro features</span>
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform text-white" />
            </Link>
          </Button>
        </motion.div>

        {/* Key Features Pill */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 1.5, ease: [0.16, 1, 0.3, 1] }}
          {...({ className: "grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl" } as any)}
        >
          {[
            { icon: Terminal, label: "Keyboard-First", color: "var(--color-accent)" },
            { icon: Sparkles, label: "AI Assistant", color: "#a855f7" },
            { icon: Zap, label: "Instant Startup", color: "var(--color-warning)" },
            { icon: Database, label: "Multi-DB Support", color: "var(--color-success)" },
          ].map((item, idx) => (
            <div key={idx} className="flex flex-col items-center gap-3 p-4 rounded-3xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-all group cursor-default border-flow">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-1 group-hover:scale-110 transition-transform"
                style={{ background: `${item.color}20`, border: `1px solid ${item.color}40` }}
              >
                <item.icon className="w-5 h-5" style={{ color: item.color }} />
              </div>
              <span className="text-xs font-mono uppercase tracking-widest text-[--color-text-secondary] group-hover:text-white transition-colors">
                {item.label}
              </span>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* The main "App" Showcase */}
      <motion.div
        initial={{ opacity: 0, y: 100, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.2, delay: 1.8, ease: [0.16, 1, 0.3, 1] }}
        {...({ className: "relative z-20 w-full max-w-6xl px-4 mt-20" } as any)}
      >
        <div className="relative group">
          {/* Decorative background glow */}
          <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-b from-[--color-accent] to-purple-600 opacity-20 blur-2xl group-hover:opacity-30 transition-opacity" />

          {/* Window Chrome */}
          <div className="relative rounded-[2rem] overflow-hidden border border-white/10 shadow-3xl bg-[--color-surface] shadow-black/80">
            {/* Title bar */}
            <div className="h-12 border-b border-white/5 bg-white/[0.02] flex items-center justify-between px-6">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <div className="w-3 h-3 rounded-full bg-[#28c840]" />
              </div>
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-50">
                <Command className="w-3.5 h-3.5" />
                <span className="text-[10px] font-mono tracking-widest uppercase">data-peek — main — products_db</span>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-4 rounded-md bg-white/5" />
                <div className="w-8 h-4 rounded-md bg-white/5" />
              </div>
            </div>

            {/* App Content */}
            <div className="flex min-h-[500px] h-[60vh] max-h-[800px]">
              {/* Fake Sidebar */}
              <div className="w-64 border-r border-white/5 bg-white/[0.01] hidden md:flex flex-col p-4 gap-6">
                <div className="space-y-3">
                  <div className="h-2 w-24 bg-white/10 rounded" />
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-white/5" />
                        <div className="h-1.5 w-full bg-white/5 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="h-2 w-20 bg-white/10 rounded" />
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-white/5" />
                        <div className="h-1.5 w-full bg-white/5 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fake Editor & Results */}
              <div className="flex-1 flex flex-col">
                <HeroTerminal />
              </div>
            </div>
          </div>

          {/* Command Palette Overlay (Absolute Floating) */}
          <div className="absolute -top-12 -right-12 z-30 hidden lg:block animate-float">
            <div className="glass p-1 rounded-2xl border-white/20 shadow-2xl">
              <div className="bg-[--color-surface-elevated] rounded-xl border border-white/10 p-4 w-[320px]">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3 mb-3">
                  <Command className="w-4 h-4 text-[--color-accent]" />
                  <div className="h-4 w-full bg-white/10 rounded" />
                </div>
                <div className="space-y-2">
                  {[
                    { label: "New Query", key: "⌘ N" },
                    { label: "Format SQL", key: "⌘ ⇧ F" },
                    { label: "Export as CSV", key: "⌘ E" },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors">
                      <span className="text-[11px] font-mono text-[--color-text-secondary]">{item.label}</span>
                      <kbd className="text-[9px] font-mono text-[--color-text-muted] bg-white/5 px-1.5 py-0.5 rounded border border-white/5">{item.key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
