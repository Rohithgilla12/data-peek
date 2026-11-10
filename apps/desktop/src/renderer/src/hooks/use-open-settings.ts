import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { SettingsSection } from '@/components/settings/sections'

export function useOpenSettings() {
  const navigate = useNavigate()
  return useCallback(
    (section: SettingsSection = 'general') => navigate({ to: '/settings', search: { section } }),
    [navigate]
  )
}
