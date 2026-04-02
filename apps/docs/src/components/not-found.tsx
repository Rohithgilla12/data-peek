import { Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center text-center px-6">
        {/* Glitchy 404 */}
        <div className="relative mb-6">
          <h1 className="text-[8rem] md:text-[12rem] font-bold text-[#6b8cf5]/10 leading-none select-none">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl md:text-8xl font-bold text-[#6b8cf5]">404</span>
          </div>
        </div>

        {/* Message */}
        <h2 className="text-2xl md:text-3xl font-semibold text-[#fafafa] mb-4">
          Page Not Found
        </h2>
        <p className="text-[#71717a] max-w-md mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved. Check the URL or head back
          to the docs.
        </p>

        {/* Terminal-style hint */}
        <div className="mb-8 p-4 rounded-lg border border-[#27272a] bg-[#111113]/50 font-mono text-sm">
          <span className="text-[#71717a]">Error:</span>{' '}
          <span className="text-[#f87171]">ENOENT</span>{' '}
          <span className="text-[#a1a1aa]">- no such page or directory</span>
        </div>

        {/* CTA */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#6b8cf5] text-[#0a0a0b] font-semibold text-sm transition-all hover:bg-[#fafafa] hover:shadow-lg hover:shadow-[#6b8cf5]/20"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          Back to Home
        </Link>
      </div>
    </HomeLayout>
  );
}
