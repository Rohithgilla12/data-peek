import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@data-peek/ui'

const components: Components = {
  p: ({ children }) => <p className="[&:not(:first-child)]:mt-2">{children}</p>,
  ul: ({ children }) => <ul className="mt-1.5 list-disc space-y-0.5 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-muted/70 px-1 py-px font-mono text-[12px] text-foreground/90">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mt-2 overflow-x-auto rounded-md bg-muted/40 p-2 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  a: ({ children }) => <span className="text-primary">{children}</span>
}

/** The assistant's answer: Markdown, kept quiet and dense. Links are not followed. */
export function AskProse({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <div
      className={cn(
        'font-sans text-[13px] leading-relaxed',
        muted ? 'text-muted-foreground' : 'text-foreground/85'
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
