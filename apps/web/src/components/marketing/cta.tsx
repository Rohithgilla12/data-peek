"use client";

import Link from "next/link";
import {
  Download,
  Github,
  ArrowRight,
  Command,
  Sparkles,
  Database,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeIn, ScaleIn } from "@/components/ui/motion-wrapper";
import { motion } from "framer-motion";

export function CTA() {
  return (
    <section className="relative py-32 sm:py-48 overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[--color-accent] opacity-10 blur-[120px] rounded-full" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
        <ScaleIn>
          <div className="relative p-8 sm:p-16 md:p-24 rounded-[3rem] bg-white/[0.02] border border-white/10 overflow-hidden text-center backdrop-blur-xl shadow-3xl">
            {/* Background pattern */}
            <div className="absolute inset-0 grid-pattern opacity-10" />

            {/* Decorative icons */}
            <div className="absolute top-10 left-10 hidden lg:block opacity-20 animate-float">
              <Database className="w-12 h-12 text-[--color-accent]" />
            </div>
            <div
              className="absolute bottom-10 right-10 hidden lg:block opacity-20 animate-float"
              style={{ animationDelay: "1s" }}
            >
              <Sparkles className="w-16 h-16 text-purple-500" />
            </div>
            <div
              className="absolute top-1/2 right-20 hidden lg:block opacity-10 animate-float"
              style={{ animationDelay: "2s" }}
            >
              <Zap className="w-8 h-8 text-[--color-warning]" />
            </div>

            <FadeIn>
              <p className="text-[12px] uppercase tracking-[0.4em] text-[--color-accent] mb-8 font-bold font-mono">
                // Ready to Peek?
              </p>
              <h2 className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tighter leading-[0.9] mb-10 max-w-4xl mx-auto">
                Take control of your data.
                <br />
                <span className="text-[--color-text-secondary]">
                  Download data-peek today.
                </span>
              </h2>
              <p className="text-base sm:text-lg text-[--color-text-muted] max-w-xl mx-auto mb-12 font-mono leading-relaxed opacity-80">
                Experience the fastest way to query and manage your databases.
                Developers are switching to data-peek.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <Button
                  size="xl"
                  className="group rounded-2xl px-10 bg-[--color-accent] text-[--color-background] hover:bg-[--color-accent]/90 shadow-2xl shadow-[--color-accent]/20 font-mono uppercase tracking-widest font-bold"
                  asChild
                >
                  <Link href="/download">
                    <Download className="w-5 h-5 group-hover:animate-bounce" />
                    <span>Download Free</span>
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="xl"
                  className="rounded-2xl px-10 border-white/10 hover:bg-white/5 font-mono uppercase tracking-widest font-bold group"
                  asChild
                >
                  <Link href="https://github.com/Rohithgilla12/data-peek">
                    <Github className="w-5 h-5" />
                    <span>Star on GitHub</span>
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              </div>

              <div className="mt-12 flex items-center justify-center gap-6 text-[10px] font-mono text-[--color-text-muted] uppercase tracking-[0.2em] opacity-60">
                <span>macOS (M1/M2/Intel)</span>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span>Windows 10/11</span>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span>Linux (.deb / .rpm / .appimage)</span>
              </div>
            </FadeIn>
          </div>
        </ScaleIn>
      </div>
    </section>
  );
}
