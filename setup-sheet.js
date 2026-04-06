// ─────────────────────────────────────────────────────────────
// setup-sheet.js — Run ONCE to set up the Leads sheet
// node setup-sheet.js
// ─────────────────────────────────────────────────────────────

import dotenv    from 'dotenv'
import { google } from 'googleapis'

dotenv.config()

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

const sheets    = google.sheets({ version: 'v4', auth })
const SHEET_ID  = process.env.GOOGLE_SHEET_ID
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Leads'

// Column headers — order must match COL constants in server.js
const HEADERS = [
  '#',                // A — row number
  'Name',             // B ← YOU fill this
  'Phone',            // C ← YOU fill this
  'Email',            // D ← YOU fill this (optional)
  'Company',          // E ← YOU fill this (optional)
  'Goal',             // F ← YOU fill this (optional)
  'Service Interest', // G ← YOU fill this (optional)
  'Status',           // H ← DIALER writes
  'Call ID',          // I ← DIALER writes
  'Last Called',      // J ← DIALER writes
  'Retry Count',      // K ← DIALER writes
  'Outcome',          // L ← WEBHOOK writes
  'AI Summary',       // M ← WEBHOOK writes
  'Next Follow-Up',   // N ← WEBHOOK writes
  'Notes',            // O ← manual notes
]

async function setup() {
  console.log('\n🔧 Setting up Shanvox Leads sheet...\n')

  // Write headers
  await sheets.spreadsheets.values.update({
    spreadsheetId:    SHEET_ID,
    range:            `${SHEET_NAME}!A1:O1`,
    valueInputOption: 'RAW',
    resource:         { values: [HEADERS] },
  })

  // Get sheet ID for formatting
  const { data } = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const sheet    = data.sheets.find(s => s.properties.title === SHEET_NAME)

  if (!sheet) {
    console.error(`Sheet tab "${SHEET_NAME}" not found. Create it first.`)
    process.exit(1)
  }

  const sheetId = sheet.properties.sheetId

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    resource: {
      requests: [
        // Bold header row
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.13, green: 0.13, blue: 0.18 },
                textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
        // Freeze header row
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        // Color "Dialer writes" columns (H–K) light blue
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 7, endColumnIndex: 11 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.87, green: 0.92, blue: 1.0 },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        // Color "Webhook writes" columns (L–N) light green
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 11, endColumnIndex: 14 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.85, green: 1.0, blue: 0.87 },
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
        // Auto-resize all columns
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 15 },
          },
        },
      ],
    },
  })

  console.log('✅ Sheet setup complete!\n')
  console.log('Columns:')
  HEADERS.forEach((h, i) => {
    const col    = String.fromCharCode(65 + i)
    const writer = i >= 7 && i <= 10 ? '← DIALER' : i >= 11 && i <= 13 ? '← WEBHOOK' : '← you fill'
    console.log(`  ${col}  ${h.padEnd(20)} ${writer}`)
  })
  console.log(`\nSheet: https://docs.google.com/spreadsheets/d/${SHEET_ID}\n`)
  console.log('Next: add your leads (Name + Phone minimum), then run: node dialer.js\n')
}

setup().catch(err => {
  console.error('\n❌ Setup failed:', err.message)
  process.exit(1)
})
