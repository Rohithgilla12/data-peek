import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Renders a styled card container used to group related content.
 *
 * The element is a div with `data-slot="card"`, default card styling, the provided `className` merged via `cn`, and any other passed div props.
 *
 * @returns The rendered card div element.
 */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('rounded-xl border bg-card text-card-foreground shadow', className)}
      {...props}
    />
  )
}

/**
 * Renders the header section of a Card component.
 *
 * @returns A `div` element with `data-slot="card-header"` that applies vertical layout, gap, and padding; merges the provided `className` and forwards remaining `div` props.
 */
function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col space-y-1.5 p-6', className)}
      {...props}
    />
  )
}

/**
 * Renders a card title element with title typography and optional className/props.
 *
 * @returns The rendered div element with `data-slot="card-title"` and title typography classes applied.
 */
function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
}

/**
 * Renders the card description slot with small, muted text styling.
 *
 * @param className - Additional CSS class names merged with the component's default styles
 * @returns A `div` element for the card description slot (`data-slot="card-description"`)
 */
function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

/**
 * Renders the card's content slot with default padding and optional additional classes.
 *
 * @returns The div element for the card content (`data-slot="card-content"`) with overall padding and top padding set to 0, merged with any provided `className`.
 */
function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('p-6 pt-0', className)} {...props} />
}

/**
 * Renders the card footer slot with horizontal layout and padding.
 *
 * @param className - Additional CSS class names to merge with the component's defaults
 * @param props - Additional props are spread onto the root `div` (e.g., event handlers, ARIA attributes)
 * @returns A JSX element representing the card's footer container
 */
function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center p-6 pt-0', className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
