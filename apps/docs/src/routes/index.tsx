import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { generateMetaTags, DOCS_CONFIG } from "@/lib/seo";
import {
  Book,
  ChevronRight,
  Github,
  Zap,
  Keyboard,
  Moon,
  Globe,
  Terminal,
} from "lucide-static";
import { motion } from "framer-motion";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: generateMetaTags({
      title: DOCS_CONFIG.title,
      description: DOCS_CONFIG.description,
      keywords: [
        'data-peek documentation',
        'PostgreSQL client docs',
        'MySQL client docs',
        'SQL client documentation',
        'database client guide',
        'SQL editor documentation',
      ],
    }),
  }),
});

function Icon({
  svg,
  className,
}: {
  svg: string;
  className?: string;
}) {
  const styledSvg = svg.replace(
    /class="[^"]*"/,
    `class="${className ?? ""}"`
  );
  return <span dangerouslySetInnerHTML={{ __html: styledSvg }} />;
}

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-6 py-20 overflow-hidden">
        {/* Living Backgrounds */}
        <div className="absolute inset-0 grid-pattern opacity-30 pointer-events-none" />
        
        <div
          className="absolute top-1/4 -left-32 w-[500px] h-[500px] rounded-full opacity-20 pointer-events-none animate-float"
          style={{
            background: "radial-gradient(circle, #6b8cf5 0%, transparent 70%)",
            filter: "blur(100px)",
          }}
        />
        <div
          className="absolute bottom-1/4 -right-32 w-[600px] h-[600px] rounded-full opacity-10 pointer-events-none animate-float"
          style={{
            background: "radial-gradient(circle, #a855f7 0%, transparent 70%)",
            filter: "blur(120px)",
            animationDelay: "2s"
          }}
        />

        {/* Hero Section */}
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          {/* Animated Globe Icon (Matching Video Vibe) */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ 
              type: "spring", 
              damping: 12, 
              stiffness: 100,
              delay: 0.2
            }}
            className="mb-12 flex justify-center"
          >
            <div className="relative">
              <div className="absolute -inset-12 rounded-full bg-[#6b8cf5] opacity-20 blur-3xl animate-pulse" />
              <div className="relative w-24 h-24 rounded-[2rem] bg-white/[0.03] border border-white/10 flex items-center justify-center text-[#6b8cf5] shadow-2xl glass-card">
                <Icon svg={Book} className="w-10 h-10" />
              </div>
            </div>
          </motion.div>

          {/* Title */}
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
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter mb-6 text-white uppercase font-mono">
              data-peek <span className="text-[#6b8cf5]">docs</span>
            </h1>
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-lg md:text-2xl text-[#a1a1aa] mb-12 max-w-2xl mx-auto leading-relaxed font-mono"
          >
            The technical guide to the minimal, fast, and lightweight
            SQL client for professional developers.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col sm:flex-row gap-6 justify-center items-center"
          >
            <Link
              to="/docs/$"
              params={{ _splat: "" }}
              className="group relative inline-flex items-center gap-3 px-10 py-4 rounded-2xl bg-[#6b8cf5] text-[#0a0a0b] font-bold text-sm uppercase tracking-widest transition-all hover:bg-white hover:shadow-2xl hover:shadow-[#6b8cf5]/40 font-mono"
            >
              <Icon svg={Book} className="w-4 h-4" />
              Start Reading
              <span className="transition-transform group-hover:translate-x-1">
                <Icon svg={ChevronRight} className="w-4 h-4" />
              </span>
            </Link>
            <a
              href="https://github.com/Rohithgilla12/data-peek"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-10 py-4 rounded-2xl border border-white/10 text-white font-bold text-sm uppercase tracking-widest transition-all hover:bg-white/5 hover:border-[#6b8cf5] font-mono"
            >
              <Icon svg={Github} className="w-4 h-4" />
              Source Code
            </a>
          </motion.div>
        </div>

        {/* Feature highlights */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 mt-32 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-5xl mx-auto"
        >
          {[
            { icon: Zap, title: "Lightning Fast", desc: "Built for speed. No splash screens, no waiting. Opens in under 2 seconds.", color: "#6b8cf5" },
            { icon: Keyboard, title: "Keyboard First", desc: "Designed for power users. Navigate and query everything with shortcuts.", color: "#fbbf24" },
            { icon: Moon, title: "Modern Design", desc: "Clean terminal-inspired UI that stays out of your way during deep work.", color: "#a855f7" },
          ].map((feature, idx) => (
            <div key={idx} className="group p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 backdrop-blur-xl transition-all hover:bg-white/[0.04] border-flow overflow-hidden">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-[#6b8cf5] mb-6 border border-white/10 group-hover:scale-110 transition-transform duration-500">
                <Icon svg={feature.icon} className="w-6 h-6" style={{ color: feature.color }} />
              </div>
              <h3 className="text-white font-bold mb-3 uppercase tracking-widest text-lg font-mono">
                {feature.title}
              </h3>
              <p className="text-[#a1a1aa] text-sm leading-relaxed font-mono group-hover:text-white transition-colors">
                {feature.desc}
              </p>
            </div>
          ))}
        </motion.div>

        {/* Terminal decoration */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 text-[#71717a] text-xs font-mono uppercase tracking-[0.2em]"
        >
          <span className="text-[#6b8cf5]">$</span> data-peek --help
          <span className="inline-block w-2 h-4 bg-[#6b8cf5] ml-2 animate-pulse" />
        </motion.div>
      </main>
    </HomeLayout>
  );
}
