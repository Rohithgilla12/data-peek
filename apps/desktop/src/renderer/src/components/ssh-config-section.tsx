import { Eye, EyeOff, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { SSHAuthenticationMethod, SSHConfig } from '@shared/index'
import { useState } from 'react'

interface SSHConfigSectionProps {
  config: SSHConfig
  onConfigChange: (config: SSHConfig) => void
}

export function SSHConfigSection({ config, onConfigChange }: SSHConfigSectionProps) {
  const updateConfig = (updates: Partial<SSHConfig>) => {
    onConfigChange({ ...config, ...updates })
  }

  const handleFilePickerClick = async () => {
    const filePath = await window.api.files.openFilePicker()
    if (!filePath) return

    updateConfig({
      privateKeyPath: filePath
    })
  }
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [showSshPassword, setShowSshPassword] = useState(false)

  const handlePassphraseToggle = () => {
    setShowPassphrase((prev) => !prev)
  }
  const handleSshPasswordToggle = () => {
    setShowSshPassword((prev) => !prev)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="sshHost" className="text-sm font-medium">
          SSH Host
        </label>
        <Input
          id="sshHost"
          placeholder="your-server.com"
          value={config.host}
          onChange={(e) => updateConfig({ host: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="sshPort" className="text-sm font-medium">
          SSH Port
        </label>
        <Input
          id="sshPort"
          type="number"
          placeholder="22"
          value={String(config.port)}
          onChange={(e) => updateConfig({ port: parseInt(e.target.value, 10) || 22 })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="sshUser" className="text-sm font-medium">
          SSH Username
        </label>
        <Input
          id="sshUser"
          placeholder="user"
          value={config.user}
          onChange={(e) => updateConfig({ user: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="sshAuthType" className="text-sm font-medium">
          SSH Authentication Method
        </label>
        <Select
          value={config.authMethod}
          onValueChange={(v) => updateConfig({ authMethod: v as SSHAuthenticationMethod })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select authentication method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Password">Password</SelectItem>
            <SelectItem value="Public Key">Public Key</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {config.authMethod === 'Password' && (
        <div className="flex flex-col gap-2">
          <label htmlFor="sshPassword" className="text-sm font-medium">
            SSH Password
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="sshPassword"
              type={showSshPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={config.password || ''}
              onChange={(e) => updateConfig({ password: e.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSshPasswordToggle}
              className="px-3"
              title={showSshPassword ? 'Hide password' : 'Show password'}
            >
              {showSshPassword ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        </div>
      )}

      {config.authMethod === 'Public Key' && (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="sshPrivateKey" className="text-sm font-medium">
              Private Key Path
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="sshPrivateKey"
                placeholder="~/.ssh/id_rsa"
                value={config.privateKeyPath}
                onChange={(e) => updateConfig({ privateKeyPath: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleFilePickerClick}
                className="px-3"
              >
                <FolderOpen className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="sshPassphrase" className="text-sm font-medium">
              Passphrase (optional)
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="sshPassphrase"
                type={showPassphrase ? 'text' : 'password'}
                placeholder="••••••••"
                value={config.passphrase || ''}
                onChange={(e) => updateConfig({ passphrase: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePassphraseToggle}
                className="px-3"
                title={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
              >
                {showPassphrase ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
