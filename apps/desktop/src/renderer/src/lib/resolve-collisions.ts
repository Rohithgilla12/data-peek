import type { Node } from '@xyflow/react'

export interface CollisionOptions {
  maxIterations?: number
  overlapThreshold?: number
  margin?: number
}

interface Box {
  x: number
  y: number
  width: number
  height: number
  node: Node
  moved: boolean
}

function getBoxesFromNodes(nodes: Node[], margin: number = 0): Box[] {
  const boxes: Box[] = new Array(nodes.length)

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    boxes[i] = {
      x: node.position.x - margin,
      y: node.position.y - margin,
      width: (node.width ?? node.measured?.width ?? 0) + margin * 2,
      height: (node.height ?? node.measured?.height ?? 0) + margin * 2,
      node,
      moved: false
    }
  }

  return boxes
}

export function resolveCollisions<T extends Node>(
  nodes: T[],
  options: CollisionOptions = {}
): T[] {
  const { maxIterations = 50, overlapThreshold = 0.5, margin = 0 } = options

  // Filter out cluster nodes - they're background elements and shouldn't participate in collision
  const draggableNodes = nodes.filter(
    (n) => n.type !== 'clusterNode' && n.draggable !== false && n.selectable !== false
  )

  if (draggableNodes.length === 0) {
    return nodes
  }

  const boxes = getBoxesFromNodes(draggableNodes, margin)

  for (let iter = 0; iter <= maxIterations; iter++) {
    let moved = false

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i]
        const B = boxes[j]

        // Calculate centers
        const centerAX = A.x + A.width * 0.5
        const centerAY = A.y + A.height * 0.5
        const centerBX = B.x + B.width * 0.5
        const centerBY = B.y + B.height * 0.5

        // Calculate distance between centers
        const dx = centerAX - centerBX
        const dy = centerAY - centerBY

        // Calculate penetration depth on each axis
        const px = (A.width + B.width) * 0.5 - Math.abs(dx)
        const py = (A.height + B.height) * 0.5 - Math.abs(dy)

        // Check if there's an overlap
        if (px > overlapThreshold && py > overlapThreshold) {
          A.moved = B.moved = moved = true

          // Resolve along the axis with smallest penetration
          if (px < py) {
            const sx = dx > 0 ? 1 : -1
            const moveAmount = (px / 2) * sx
            A.x += moveAmount
            B.x -= moveAmount
          } else {
            const sy = dy > 0 ? 1 : -1
            const moveAmount = (py / 2) * sy
            A.y += moveAmount
            B.y -= moveAmount
          }
        }
      }
    }

    if (!moved) break
  }

  // Build result: update positions for moved nodes
  const updatedDraggableNodes = boxes.map((box) => {
    if (box.moved) {
      return {
        ...box.node,
        position: { x: box.x + margin, y: box.y + margin }
      } as T
    }
    return box.node as T
  })

  // Combine static and updated draggable nodes, preserving original order
  const nodeIdToUpdated = new Map(updatedDraggableNodes.map((n) => [n.id, n]))
  return nodes.map((n) => nodeIdToUpdated.get(n.id) ?? n)
}
