import { cva, type VariantProps } from 'class-variance-authority'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs))
}

const badgeVariants = cva(
  'inline-flex items-center rounded-full font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-(--color-accent-glow) text-(--color-accent) border border-(--color-accent)/20',
        secondary:
          'bg-(--color-surface) text-(--color-text-secondary) border border-(--color-border)',
        success:
          'bg-(--color-success)/10 text-(--color-success) border border-(--color-success)/20',
        warning:
          'bg-(--color-warning)/10 text-(--color-warning) border border-(--color-warning)/20',
        destructive:
          'bg-(--color-error)/10 text-(--color-error) border border-(--color-error)/20',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-3 py-1 text-sm',
        lg: 'px-4 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      style={{ fontFamily: 'var(--font-mono)' }}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
