import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import { StructuredData } from './structured-data'

interface BreadcrumbItem {
  label: string
  href: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const breadcrumbItems = [
    { name: 'Home', url: 'https://www.datapeek.dev' },
    ...items.map((item) => ({ name: item.label, url: `https://www.datapeek.dev${item.href}` })),
  ]

  return (
    <>
      <StructuredData type="breadcrumb" data={{ breadcrumb: breadcrumbItems }} />
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-[--color-text-muted] mb-6">
        <Link
          href="/"
          className="flex items-center gap-1 hover:text-[--color-text-primary] transition-colors"
          aria-label="Home"
        >
          <Home className="w-3.5 h-3.5" />
        </Link>
        {items.map((item, index) => (
          <span key={item.href} className="flex items-center gap-2">
            <ChevronRight className="w-3.5 h-3.5" />
            {index === items.length - 1 ? (
              <span className="text-[--color-text-primary]" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="hover:text-[--color-text-primary] transition-colors"
              >
                {item.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
    </>
  )
}

