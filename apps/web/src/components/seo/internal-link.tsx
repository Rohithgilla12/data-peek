import Link from 'next/link'
import type { ReactNode } from 'react'

interface InternalLinkProps {
  href: string
  children: ReactNode
  className?: string
  title?: string
  'aria-label'?: string
}

/**
 * Internal link component with SEO-friendly attributes
 * Ensures proper internal linking structure for SEO
 */
export function InternalLink({
  href,
  children,
  className,
  title,
  'aria-label': ariaLabel,
}: InternalLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      title={title}
      aria-label={ariaLabel}
      prefetch={true}
    >
      {children}
    </Link>
  )
}

