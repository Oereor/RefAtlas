import { registerHooks } from 'node:module'
// Node's native TypeScript worker uses the same extensionless src imports as Vite.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && context.parentURL?.includes('/src/'))
        return nextResolve(specifier + '.ts', context)
      throw error
    }
  },
})
