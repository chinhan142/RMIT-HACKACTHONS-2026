import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const config = fileURLToPath(new URL('tidecloak.json', root))

if (!existsSync(config)) {
  copyFileSync(new URL('tidecloak.example.json', root), config)
  console.log('Created tidecloak.json placeholder. Run npm run init to configure TideCloak.')
}
