import { defineConfig, defineDocs } from 'fumadocs-mdx/config'
import remarkGfm from 'remark-gfm'
import remarkSmartypants from 'remark-smartypants'

export const docs = defineDocs({
  dir: 'content/docs',
})

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkGfm, remarkSmartypants],
  },
})
