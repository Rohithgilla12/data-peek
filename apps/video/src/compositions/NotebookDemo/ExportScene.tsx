import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from 'remotion'
import { brand } from '../../lib/colors'
import { CyanGlow } from '../../components/CyanGlow'
import { FileJson, FileText, ArrowRight } from 'lucide-react'

type FileCardProps = {
  icon: React.FC<{ size: number; color: string; strokeWidth: number }>
  extension: string
  title: string
  description: string
  previewLines: string[]
  accentColor: string
  delay: number
}

const FileCard: React.FC<FileCardProps> = ({
  icon: Icon,
  extension,
  title,
  description,
  previewLines,
  accentColor,
  delay,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const entrance = spring({ frame: frame - delay, fps, config: { damping: 200 } })
  const opacity = interpolate(entrance, [0, 1], [0, 1])
  const translateY = interpolate(entrance, [0, 1], [40, 0])
  const scale = interpolate(entrance, [0, 1], [0.9, 1])

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        width: 380,
        backgroundColor: brand.surface,
        border: `1px solid ${accentColor}40`,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: `0 0 40px ${accentColor}10`,
      }}
    >
      <div
        style={{
          backgroundColor: `${accentColor}10`,
          borderBottom: `1px solid ${accentColor}30`,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: `${accentColor}20`,
            border: `1px solid ${accentColor}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={20} color={accentColor} strokeWidth={1.5} />
        </div>
        <div>
          <div
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 16,
              fontWeight: 700,
              color: brand.textPrimary,
            }}
          >
            {extension}
          </div>
          <div
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 12,
              color: accentColor,
              marginTop: 2,
            }}
          >
            {title}
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 18px' }}>
        <div
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 12,
            color: brand.textSecondary,
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>

        <div
          style={{
            backgroundColor: brand.surfaceElevated,
            border: `1px solid ${brand.border}`,
            borderRadius: 6,
            padding: '10px 12px',
          }}
        >
          {previewLines.map((line, i) => (
            <div
              key={i}
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                color: i === 0 ? accentColor : brand.textMuted,
                lineHeight: 1.6,
                opacity: i === 0 ? 1 : 0.7 - i * 0.1,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export const ExportScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const headerEntrance = spring({ frame, fps, config: { damping: 200 } })
  const headerOpacity = interpolate(headerEntrance, [0, 1], [0, 1])
  const headerY = interpolate(headerEntrance, [0, 1], [30, 0])

  const arrowEntrance = spring({ frame: frame - 30, fps, config: { damping: 200 } })
  const arrowOpacity = interpolate(arrowEntrance, [0, 1], [0, 1])

  const notebookEntrance = spring({ frame, fps, config: { damping: 200 } })
  const notebookOpacity = interpolate(notebookEntrance, [0, 1], [0, 1])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 48,
      }}
    >
      <CyanGlow size={400} x="20%" y="70%" delay={0} />

      <div
        style={{
          opacity: headerOpacity,
          transform: `translateY(${headerY}px)`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 42,
            fontWeight: 700,
            color: brand.textPrimary,
            letterSpacing: '-0.03em',
            marginBottom: 10,
          }}
        >
          Export anywhere
        </div>
        <div
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 18,
            color: brand.textMuted,
          }}
        >
          Share as a reimportable notebook or readable Markdown
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 32,
        }}
      >
        <div
          style={{
            opacity: notebookOpacity,
            backgroundColor: brand.surface,
            border: `1px solid ${brand.border}`,
            borderRadius: 10,
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: `${brand.accent}15`,
              border: `1px solid ${brand.accent}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Geist Mono, monospace',
              fontSize: 12,
              fontWeight: 700,
              color: brand.accent,
            }}
          >
            NB
          </div>
          <div>
            <div
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 14,
                fontWeight: 600,
                color: brand.textPrimary,
              }}
            >
              Debug Payment Failures
            </div>
            <div
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                color: brand.textMuted,
                marginTop: 2,
              }}
            >
              3 cells · 1 pinned result
            </div>
          </div>
        </div>

        <div style={{ opacity: arrowOpacity }}>
          <ArrowRight size={24} color={brand.textMuted} />
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          <Sequence from={30} layout="none">
            <FileCard
              icon={FileJson}
              extension=".dpnb"
              title="Data Peek Notebook"
              description="Reimportable notebook format. Preserves all cells, results, and pinned state."
              previewLines={[
                '{ "version": "1.0",',
                '  "cells": [',
                '    { "type": "md", ... },',
                '    { "type": "sql", ... }',
                '  ]',
                '}',
              ]}
              accentColor={brand.accent}
              delay={0}
            />
          </Sequence>

          <Sequence from={50} layout="none">
            <FileCard
              icon={FileText}
              extension=".md"
              title="Markdown"
              description="Human-readable export. Opens in any editor, renders on GitHub, shareable everywhere."
              previewLines={[
                '## Step 1: Check stuck payments',
                '',
                '```sql',
                'SELECT id, amount, status',
                'FROM payments',
                '```',
              ]}
              accentColor="#10b981"
              delay={0}
            />
          </Sequence>
        </div>
      </div>
    </AbsoluteFill>
  )
}
