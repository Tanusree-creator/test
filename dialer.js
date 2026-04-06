// ─────────────────────────────────────────────────────────────
// dialer.js — Run this to start the outbound dialing session
//
// Usage:
//   node dialer.js              → dial all pending rows
//   node dialer.js --dry-run    → print what would be dialed, no calls placed
//   node dialer.js --limit 5    → dial max 5 rows this run
// ─────────────────────────────────────────────────────────────

import { runDialer } from './server.js'

const args   = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limit  = args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1])
  : undefined

if (dryRun) {
  process.env.DRY_RUN = 'true'
  console.log('\n⚠️  DRY RUN MODE — no calls will be placed\n')
}

if (limit) {
  process.env.MAX_CALLS_PER_RUN = String(limit)
  console.log(`\n📋 Limit set to ${limit} calls this run\n`)
}

runDialer()
  .then(() => {
    console.log('✅ Dialer session complete.')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Dialer crashed:', err)
    process.exit(1)
  })
