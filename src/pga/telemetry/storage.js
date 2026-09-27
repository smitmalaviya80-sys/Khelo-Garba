export class MemoryStorage {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed))
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null
  }

  setItem(key, value) {
    this.values.set(key, String(value))
  }

  removeItem(key) {
    this.values.delete(key)
  }
}

export function createResilientStorage(primary = null) {
  const memory = new MemoryStorage()

  return {
    getItem(key) {
      if (primary) {
        try {
          const value = primary.getItem(key)
          if (value != null) return value
        } catch {
          // Private mode, quota/security failures and disabled storage fall back to memory.
        }
      }
      return memory.getItem(key)
    },

    setItem(key, value) {
      let persisted = false
      if (primary) {
        try {
          primary.setItem(key, String(value))
          persisted = true
        } catch {
          // Keep a working in-memory copy instead of surfacing analytics failure to the app.
        }
      }
      memory.setItem(key, value)
      return persisted
    },

    removeItem(key) {
      if (primary) {
        try {
          primary.removeItem(key)
        } catch {
          // Best-effort only.
        }
      }
      memory.removeItem(key)
    },
  }
}
