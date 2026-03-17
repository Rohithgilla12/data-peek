const fs = require('fs')
const path = require('path')

class Store {
  constructor(opts) {
    const dataDir = process.env.DATA_DIR || './data'
    try { fs.mkdirSync(dataDir, { recursive: true }) } catch {}
    this.filePath = path.join(dataDir, `${opts.name || 'store'}.json`)
    try {
      this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
    } catch {
      this.data = opts.defaults || {}
    }
  }
  get(key, defaultValue) { return this.data[key] ?? defaultValue }
  set(key, value) {
    this.data[key] = value
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
  }
  delete(key) { delete this.data[key]; this.set() }
  has(key) { return key in this.data }
  clear() { this.data = {}; fs.writeFileSync(this.filePath, '{}') }
  get path() { return this.filePath }
}

module.exports = Store
module.exports.default = Store
