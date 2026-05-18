import { cva, type VariantProps } from 'class-variance-authority'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs))
}

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-(--color-accent) focus:ring-offset-2 focus:ring-offset-(--color-background) disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary:
          'bg-(--color-accent) text-(--color-background) hover:bg-(--color-text-primary) hover:-translate-y-0.5 hover:shadow-[0_10px_40px_rgba(34,211,238,0.3)]',
        secondary:
          'bg-transparent text-(--color-text-primary) border border-(--color-border) hover:border-(--color-accent) hover:text-(--color-accent) hover:bg-(--color-accent-glow)',
        outline:
          'bg-transparent text-(--color-text-primary) border border-white/10 hover:bg-white/5 hover:border-white/20',
        ghost:
          'bg-transparent text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-surface)',
        link: 'bg-transparent text-(--color-accent) hover:text-(--color-text-primary) underline-offset-4 hover:underline p-0',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        md: 'h-11 px-6 text-sm',
        lg: 'h-14 px-8 text-base',
        xl: 'h-16 px-10 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={{ fontFamily: 'var(--font-display)' }}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
