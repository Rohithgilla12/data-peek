"use client";

import Link from "next/link";
import { Header } from "@/components/marketing/header";
import { Footer } from "@/components/marketing/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Apple,
  Monitor,
  Terminal,
  Check,
  ArrowRight,
  Cpu,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  FadeIn,
  StaggerContainer,
  StaggerItem,
  ScaleIn,
} from "@/components/ui/motion-wrapper";
import { motion } from "framer-motion";

const platforms = [
  {
    name: "macOS",
    icon: Apple,
    description: "Apple Silicon & Intel",
    variants: [
      {
        label: "Apple Silicon",
        sublabel: "M1, M2, M3, M4",
        filename: "data-peek-mac-arm64.dmg",
        size: "~85 MB",
        recommended: true,
      },
      {
        label: "Intel",
        sublabel: "x86_64",
        filename: "data-peek-mac-x64.dmg",
        size: "~90 MB",
        recommended: false,
      },
    ],
    color: "var(--color-accent)",
  },
  {
    name: "Windows",
    icon: Monitor,
    description: "Windows 10/11",
    variants: [
      {
        label: "Installer",
        sublabel: ".exe",
        filename: "data-peek-win-setup.exe",
        size: "~75 MB",
        recommended: true,
      },
      {
        label: "Portable",
        sublabel: ".zip",
        filename: "data-peek-win-portable.zip",
        size: "~80 MB",
        recommended: false,
      },
    ],
    color: "#60a5fa",
  },
  {
    name: "Linux",
    icon: Terminal,
    description: "Ubuntu, Debian, Fedora",
    variants: [
      {
        label: "AppImage",
        sublabel: "Universal",
        filename: "data-peek-linux.AppImage",
        size: "~95 MB",
        recommended: true,
      },
      {
        label: ".deb",
        sublabel: "Debian/Ubuntu",
        filename: "data-peek-linux.deb",
        size: "~85 MB",
        recommended: false,
      },
    ],
    color: "var(--color-success)",
  },
];

const requirements = [
  "macOS 11+ (Big Sur or later)",
  "Windows 10/11 (64-bit)",
  "Linux with glibc 2.31+",
  "4 GB RAM minimum",
  "200 MB disk space",
];

export default function DownloadPage() {
  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-32 sm:pt-48 pb-24 overflow-hidden">
        {/* Background elements */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-gradient-to-b from-(--color-accent)/5 to-transparent pointer-events-none" />
        <div className="absolute inset-0 grid-pattern opacity-10 pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
          {/* Hero Section */}
          <FadeIn className="text-center mb-20 sm:mb-32">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8 glass-card">
              <Zap className="w-3.5 h-3.5 text-(--color-warning)" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-(--color-text-secondary)">
                v0.19.0 — Latest Stable
              </span>
            </div>

            <h1 className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter leading-[0.9] mb-8 font-mono uppercase">
              Get the client.
              <br />
              <span className="text-(--color-text-secondary)">
                Start peek-ing.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-(--color-text-muted) max-w-xl mx-auto mb-12 font-mono leading-relaxed opacity-80">
              Free to download. No sign-up required. Experience the future of
              database management.
            </p>
          </FadeIn>

          {/* Platform Cards */}
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-32">
            {platforms.map((platform) => (
              <StaggerItem key={platform.name}>
                <div className="group relative p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all duration-500 border-flow overflow-hidden h-full">
                  <div className="flex items-center gap-4 mb-10">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-500"
                      style={{
                        backgroundColor: `${platform.color}15`,
                        border: `1px solid ${platform.color}30`,
                      }}
                    >
                      <platform.icon
                        className="w-7 h-7"
                        style={{ color: platform.color }}
                      />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold font-mono uppercase tracking-widest">
                        {platform.name}
                      </h3>
                      <p className="text-xs text-(--color-text-muted) font-mono uppercase tracking-widest opacity-60">
                        {platform.description}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {platform.variants.map((variant) => (
                      <Link
                        key={variant.filename}
                        href="https://github.com/Rohithgilla12/data-peek/releases"
                        target="_blank"
                        className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-(--color-accent) hover:text-(--color-background) transition-all duration-300 group/item"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-bold font-mono uppercase tracking-widest">
                            {variant.label}
                          </span>
                          <span className="text-[10px] font-mono opacity-60 group-hover/item:opacity-80">
                            {variant.sublabel} • {variant.size}
                          </span>
                        </div>
                        <Download className="w-5 h-5 opacity-40 group-hover/item:opacity-100 transition-opacity" />
                      </Link>
                    ))}
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>

          {/* Requirements & Info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            <FadeIn className="h-full">
              <div className="p-8 sm:p-12 rounded-[2.5rem] bg-white/[0.02] border border-white/5 backdrop-blur-xl h-full">
                <h2 className="text-2xl font-bold mb-8 font-mono uppercase tracking-widest">
                  System Requirements
                </h2>
                <div className="grid grid-cols-1 gap-4">
                  {requirements.map((req) => (
                    <div key={req} className="flex items-center gap-4 group">
                      <div className="w-6 h-6 rounded-full bg-(--color-success)/10 flex items-center justify-center border border-(--color-success)/20 group-hover:scale-110 transition-transform">
                        <Check className="w-3.5 h-3.5 text-(--color-success)" />
                      </div>
                      <span className="text-sm sm:text-base text-(--color-text-secondary) font-mono opacity-80">
                        {req}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>

            <FadeIn className="h-full">
              <div className="p-8 sm:p-12 rounded-[2.5rem] bg-gradient-to-br from-(--color-accent)/10 to-purple-600/10 border border-(--color-accent)/20 backdrop-blur-xl h-full flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-(--color-accent) text-(--color-background) flex items-center justify-center mb-8 shadow-xl shadow-(--color-accent)/20">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-bold mb-4 font-mono uppercase tracking-widest">
                    Go Pro
                  </h2>
                  <p className="text-sm sm:text-base text-(--color-text-secondary) font-mono leading-relaxed opacity-80 mb-8">
                    Unlock advanced intelligence, performance telemetry, and
                    professional data tools with a one-time payment.
                  </p>
                </div>
                <Button
                  size="xl"
                  className="w-full rounded-2xl py-8 font-mono uppercase tracking-widest font-bold bg-(--color-accent) text-(--color-background) hover:bg-(--color-accent)/90 shadow-xl shadow-(--color-accent)/20"
                  asChild
                >
                  <Link href="/#pricing">
                    Get Pro License — $29
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Link>
                </Button>
              </div>
            </FadeIn>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
