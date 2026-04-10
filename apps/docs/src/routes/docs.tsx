import { createFileRoute, Outlet } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import type * as PageTree from 'fumadocs-core/page-tree'
import { useMemo } from 'react'
import { source } from '@/lib/source'
import { baseOptions } from '@/lib/layout.shared'

const loadTree = createServerFn({ method: 'GET' }).handler(async () => {
  return {
    tree: source.pageTree as object,
  }
})

export const Route = createFileRoute('/docs')({
  component: DocsRouteLayout,
  loader: async () => loadTree(),
  staleTime: Infinity,
  gcTime: Infinity,
})

function DocsRouteLayout() {
  const { tree } = Route.useLoaderData()
  const transformedTree = useMemo(
    () => transformPageTree(tree as PageTree.Root),
    [tree],
  )

  return (
    <DocsLayout {...baseOptions()} tree={transformedTree}>
      <Outlet />
    </DocsLayout>
  )
}

function transformPageTree(root: PageTree.Root): PageTree.Root {
  function mapNode<T extends PageTree.Node>(item: T): T {
    if (typeof item.icon === 'string') {
      item = {
        ...item,
        icon: (
          <span
            dangerouslySetInnerHTML={{
              __html: item.icon,
            }}
          />
        ),
      }
    }

    if (item.type === 'folder') {
      return {
        ...item,
        index: item.index ? mapNode(item.index) : undefined,
        children: item.children.map(mapNode),
      }
    }

    return item
  }

  return {
    ...root,
    children: root.children.map(mapNode),
    fallback: root.fallback ? transformPageTree(root.fallback) : undefined,
  }
}
