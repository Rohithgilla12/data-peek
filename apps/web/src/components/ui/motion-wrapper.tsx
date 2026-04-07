'use client'

import { motion, HTMLMotionProps } from 'framer-motion'
import { forwardRef, type HTMLAttributes } from 'react'

export interface MotionDivProps extends HTMLMotionProps<'div'> {
  className?: string
}

export const FadeIn = forwardRef<HTMLDivElement, MotionDivProps>(
  ({ children, className, ...props }, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
)

FadeIn.displayName = 'FadeIn'

export const ScaleIn = forwardRef<HTMLDivElement, MotionDivProps>(
  ({ children, className, ...props }, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
)

ScaleIn.displayName = 'ScaleIn'

export const StaggerContainer = ({
  children,
  className,
  staggerDelay = 0.1,
  ...props
}: MotionDivProps & { staggerDelay?: number }) => (
  <motion.div
    initial="initial"
    whileInView="animate"
    viewport={{ once: true }}
    variants={{
      animate: {
        transition: {
          staggerChildren: staggerDelay,
        },
      },
    }}
    className={className}
    {...props}
  >
    {children}
  </motion.div>
)

export const StaggerItem = ({ children, className, ...props }: MotionDivProps) => (
  <motion.div
    variants={{
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
    }}
    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    className={className}
    {...props}
  >
    {children}
  </motion.div>
)
