// ============================================================
// SHANVOX — Outbound Dialer Backend (Phase 1)
//
// What this does:
//   1. Reads leads from Google Sheet
//   2. Dials them sequentially via VAPI
//   3. Dedupes (skip already-called rows)
//   4. Throttles (gap between calls, max per run)
//   5. Retries failed / no-answer calls (up to N times)
//   6. Writes back outcome + summary + next follow-up date
//   7. Sends Slack / WhatsApp alert on urgent leads
//
// What stays inside VAPI assistant (no backend needed):
//   - Explaining Shanvox services & pricing
//   - Qualifying lead (urgent vs not)
//   - Collecting requirements
//   - Booking on Google Calendar
//   - Transferring to the official
//
// Phase 2 (optional later):
//   - Product/pricing lookup from DB or Notion
//
// Setup:
//   npm install
//   cp .env.example .env   (fill in values)
//   node setup-sheet.js    (run once — adds dialer columns)
//   node dialer.js         (run the dialer)
//   node server.js         (webhook server — keep running always)
// ============================================================

import express    from 'express'
import dotenv     from 'dotenv'
import { google } from 'googleapis'
import https      from 'https'

dotenv.config()

const app = express()
app.use(express.json())

// ─── GOOGLE AUTH ─────────────────────────────────────────────
const googleAuth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth: googleAuth })

// ─── CONSTANTS ───────────────────────────────────────────────
const SHEET_ID   = process.env.GOOGLE_SHEET_ID
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Leads'
const VAPI_KEY   = process.env.VAPI_API_KEY
const ASST_ID    = process.env.VAPI_ASSISTANT_ID
const PHONE_ID   = process.env.VAPI_PHONE_NUMBER_ID

// Dialer config — tune these
const DIALER_CONFIG = {
  maxCallsPerRun:    parseInt(process.env.MAX_CALLS_PER_RUN    || '20'),
  delayBetweenMs:    parseInt(process.env.DELAY_BETWEEN_MS     || '8000'),  // 8s gap
  maxRetries:        parseInt(process.env.MAX_RETRIES          || '2'),
  retryAfterHours:   parseInt(process.env.RETRY_AFTER_HOURS    || '4'),
}

// Column positions in the sheet (0-indexed)
// A  B        C       D        E            F       G           H           I              J            K
// #  Name     Phone   Email    Company      Goal    Service     Status      Call ID        Last Called  Retry Count
// L            M             N                O
// Outcome      AI Summary    Next Follow-Up   Notes
const COL = {
  ROW_NUM:        0,   // A — row index (auto)
  NAME:           1,   // B
  PHONE:          2,   // C
  EMAIL:          3,   // D
  COMPANY:        4,   // E
  GOAL:           5,   // F
  SERVICE:        6,   // G
  STATUS:         7,   // H ← dialer writes here
  CALL_ID:        8,   // I ← dialer writes here
  LAST_CALLED:    9,   // J ← dialer writes here
  RETRY_COUNT:   10,   // K ← dialer writes here
  OUTCOME:       11,   // L ← webhook writes here
  SUMMARY:       12,   // M ← webhook writes here
  NEXT_FOLLOWUP: 13,   // N ← webhook writes here
  NOTES:         14,   // O
}

// Statuses the dialer uses
const STATUS = {
  PENDING:    'Pending',       // not yet called
  CALLING:    'Calling',       // currently being dialed
  CALLED:     'Called',        // call placed, waiting for webhook
  DONE:       'Done',          // outcome received, no further action
  RETRY:      'Retry',         // call failed/no-answer, will retry
  SKIP:       'Skip',          // manually marked to skip
  NO_NUMBER:  'No Number',     // phone field empty
}

// ─── MAIN VAPI WEBHOOK ───────────────────────────────────────
// Receives events from VAPI for every call placed by the dialer
app.post('/vapi-webhook', async (req, res) => {
  const { message } = req.body
  if (!message) return res.sendStatus(200)

  console.log(`[VAPI] ${message.type}`)

  try {
    if (message.type === 'end-of-call-report') {
      await handleEndOfCall(message)
    }
    if (message.type === 'status-update') {
      await handleStatusUpdate(message)
    }
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err.message)
  }

  res.sendStatus(200)
})

// ─── END OF CALL HANDLER ─────────────────────────────────────
async function handleEndOfCall(message) {
  const { call, summary, structuredData, transcript } = message
  const callId      = call?.id
  const outcome     = structuredData?.callOutcome || 'unknown'
  const callerPhone = call?.customer?.number || ''

  console.log(`\n[END OF CALL] ${callerPhone} | outcome: ${outcome}`)

  // Find the row in sheet by Call ID
  const rowIndex = await findRowByCallId(callId)
  if (rowIndex === -1) {
    console.warn(`[WARN] Could not find row for call ID: ${callId}`)
    return
  }

  // Determine next follow-up date
  const nextFollowUp = calcNextFollowUp(outcome, structuredData)

  // Determine final status
  const finalStatus = outcomeToStatus(outcome)

  // Write back to sheet
  await updateRow(rowIndex, {
    [COL.STATUS]:         finalStatus,
    [COL.OUTCOME]:        outcome,
    [COL.SUMMARY]:        summary || '',
    [COL.NEXT_FOLLOWUP]:  nextFollowUp,
  })

  console.log(`[SHEET] Row ${rowIndex + 1} updated → ${finalStatus}`)

  // Alert on urgent
  if (structuredData?.urgencyDetected || outcome === 'urgent_escalated') {
    await sendUrgentAlert({
      name:    structuredData?.callerName  || 'Unknown',
      phone:   callerPhone,
      company: structuredData?.callerCompany || '',
      problem: structuredData?.callerGoal  || summary || '',
      outcome,
    })
  }
}

// ─── STATUS UPDATE HANDLER ───────────────────────────────────
async function handleStatusUpdate(message) {
  const { call, status } = message
  if (!call?.id) return

  // Mark row as "Called" once call connects
  if (status === 'in-progress') {
    const rowIndex = await findRowByCallId(call.id)
    if (rowIndex !== -1) {
      await updateRow(rowIndex, { [COL.STATUS]: STATUS.CALLED })
    }
  }

  // Handle no-answer / failed
  if (['no-answer', 'failed', 'busy'].includes(status)) {
    const rowIndex = await findRowByCallId(call.id)
    if (rowIndex !== -1) {
      const row       = await getRow(rowIndex)
      const retries   = parseInt(row[COL.RETRY_COUNT] || '0')
      const newStatus = retries < DIALER_CONFIG.maxRetries ? STATUS.RETRY : STATUS.DONE
      const newOutcome = retries < DIALER_CONFIG.maxRetries ? `${status} (retry ${retries + 1}/${DIALER_CONFIG.maxRetries})` : `${status} (max retries reached)`

      await updateRow(rowIndex, {
        [COL.STATUS]:      newStatus,
        [COL.OUTCOME]:     newOutcome,
        [COL.RETRY_COUNT]: String(retries + 1),
      })

      console.log(`[${status.toUpperCase()}] Row ${rowIndex + 1} → ${newStatus}`)
    }
  }
}

// ─── HEALTH CHECK ────────────────────────────────────────────
app.get('/health', (_, res) =>
  res.json({ status: 'ok', service: 'Shanvox Dialer', time: new Date().toISOString() })
)

// ─── START WEBHOOK SERVER ────────────────────────────────────
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`\n🟢 Shanvox webhook server on port ${PORT}`)
  console.log(`   POST /vapi-webhook`)
  console.log(`   GET  /health\n`)
})

// ============================================================
// DIALER LOGIC — called from dialer.js
// Exported so dialer.js can import and run it
// ============================================================

export async function runDialer() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  SHANVOX DIALER  —  ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }))
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // 1. Read all rows from sheet
  const allRows = await getAllRows()
  console.log(`[SHEET] ${allRows.length} total rows`)

  // 2. Filter dialable rows
  const toCall = allRows.filter(row => shouldDial(row))
  console.log(`[DIALER] ${toCall.length} rows eligible to dial`)

  if (toCall.length === 0) {
    console.log('[DIALER] Nothing to dial. Exiting.')
    return
  }

  // 3. Cap at max calls per run
  const batch = toCall.slice(0, DIALER_CONFIG.maxCallsPerRun)
  console.log(`[DIALER] Dialing ${batch.length} (max ${DIALER_CONFIG.maxCallsPerRun} per run)\n`)

  let dialed = 0, skipped = 0, errors = 0

  for (const { row, rowIndex } of batch) {
    const phone   = row[COL.PHONE]?.trim()
    const name    = row[COL.NAME]?.trim()   || 'there'
    const company = row[COL.COMPANY]?.trim() || ''
    const goal    = row[COL.GOAL]?.trim()   || ''
    const service = row[COL.SERVICE]?.trim() || ''

    if (!phone) {
      await updateRow(rowIndex, { [COL.STATUS]: STATUS.NO_NUMBER })
      console.log(`[SKIP] Row ${rowIndex + 1} — no phone number`)
      skipped++
      continue
    }

    // Normalize phone to E.164
    const e164 = normalizePhone(phone)
    if (!e164) {
      await updateRow(rowIndex, {
        [COL.STATUS]:  STATUS.SKIP,
        [COL.OUTCOME]: 'Invalid phone number format',
      })
      console.log(`[SKIP] Row ${rowIndex + 1} — invalid phone: ${phone}`)
      skipped++
      continue
    }

    try {
      // Place the call
      const callId = await placeCall({ phone: e164, name, company, goal, service })

      // Mark as Calling in sheet
      await updateRow(rowIndex, {
        [COL.STATUS]:       STATUS.CALLING,
        [COL.CALL_ID]:      callId,
        [COL.LAST_CALLED]:  nowIST(),
      })

      console.log(`[CALLED] Row ${rowIndex + 1} | ${name} (${e164}) | Call ID: ${callId}`)
      dialed++

      // Wait before next call
      if (dialed < batch.length) {
        console.log(`  ⏳ Waiting ${DIALER_CONFIG.delayBetweenMs / 1000}s before next call...`)
        await sleep(DIALER_CONFIG.delayBetweenMs)
      }

    } catch (err) {
      console.error(`[ERROR] Row ${rowIndex + 1} | ${name} | ${err.message}`)
      await updateRow(rowIndex, {
        [COL.STATUS]:  STATUS.RETRY,
        [COL.OUTCOME]: `Error: ${err.message}`,
      })
      errors++
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  Done. Dialed: ${dialed} | Skipped: ${skipped} | Errors: ${errors}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
}

// ─── PLACE CALL VIA VAPI ─────────────────────────────────────
async function placeCall({ phone, name, company, goal, service }) {
  const body = JSON.stringify({
    assistantId:   ASST_ID,
    phoneNumberId: PHONE_ID,
    customer: {
      number: phone,
      name,
    },
    assistantOverrides: {
      // Personalize the opening line per lead
      firstMessage: buildFirstMessage(name, company, goal, service),
      // Pass lead context into the system prompt
      variableValues: {
        leadName:    name,
        leadCompany: company,
        leadGoal:    goal,
        leadService: service,
      },
    },
  })

  const data = await vapiPost('/call/phone', body)

  if (!data.id) throw new Error(data.message || 'No call ID returned')
  return data.id
}

function buildFirstMessage(name, company, goal, service) {
  const companyPart = company ? ` from ${company}` : ''
  const goalPart    = goal    ? ` regarding ${goal}` : ''

  return `Hi, is this ${name}? This is calling from Shanvox, a digital marketing company. I'm reaching out${companyPart}${goalPart}. Do you have a couple of minutes?`
}

// ─── VAPI API CALL ───────────────────────────────────────────
async function vapiPost(path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.vapi.ai',
      path,
      method:   'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_KEY}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }

    const req = https.request(options, res => {
      let raw = ''
      res.on('data', chunk => raw += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) }
        catch { reject(new Error(`Invalid JSON: ${raw}`)) }
      })
    })

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ─── SHEET HELPERS ───────────────────────────────────────────
async function getAllRows() {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range:         `${SHEET_NAME}!A2:O`, // skip header row
  })

  return (data.values || []).map((row, i) => ({
    row,
    rowIndex: i + 1, // 0-indexed, +1 for header
  }))
}

async function getRow(rowIndex) {
  const sheetRow = rowIndex + 2 // +1 header +1 for 1-based
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range:         `${SHEET_NAME}!A${sheetRow}:O${sheetRow}`,
  })
  return data.values?.[0] || []
}

async function updateRow(rowIndex, colValueMap) {
  // Read current row first to avoid overwriting untouched cells
  const sheetRow = rowIndex + 2
  const current  = await getRow(rowIndex)

  // Apply updates
  for (const [colIdx, val] of Object.entries(colValueMap)) {
    current[parseInt(colIdx)] = val
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId:    SHEET_ID,
    range:            `${SHEET_NAME}!A${sheetRow}:O${sheetRow}`,
    valueInputOption: 'USER_ENTERED',
    resource:         { values: [current] },
  })
}

async function findRowByCallId(callId) {
  const allRows = await getAllRows()
  const match   = allRows.find(({ row }) => row[COL.CALL_ID] === callId)
  return match ? match.rowIndex : -1
}

// ─── DIALING ELIGIBILITY ─────────────────────────────────────
function shouldDial({ row }) {
  const status     = row[COL.STATUS]     || STATUS.PENDING
  const retryCount = parseInt(row[COL.RETRY_COUNT] || '0')
  const lastCalled = row[COL.LAST_CALLED]

  // Skip statuses
  if ([STATUS.CALLING, STATUS.CALLED, STATUS.DONE, STATUS.SKIP, STATUS.NO_NUMBER].includes(status)) {
    return false
  }

  // Dial fresh pending rows
  if (status === STATUS.PENDING || status === '') return true

  // Retry rows — only if enough time has passed
  if (status === STATUS.RETRY) {
    if (retryCount >= DIALER_CONFIG.maxRetries) return false
    if (!lastCalled) return true

    const lastCalledMs  = new Date(lastCalled).getTime()
    const retryAfterMs  = DIALER_CONFIG.retryAfterHours * 60 * 60 * 1000
    return (Date.now() - lastCalledMs) >= retryAfterMs
  }

  return false
}

// ─── NEXT FOLLOW-UP DATE ─────────────────────────────────────
function calcNextFollowUp(outcome, structuredData) {
  const days = {
    appointment_booked:  null,    // booked — no follow-up needed
    lead_saved:          3,       // follow up in 3 days
    urgent_escalated:    0,       // today
    transferred:         1,
    inquiry_only:        7,
    callback_requested:  1,
    no_action:           14,
    unknown:             7,
  }

  // If structuredData has an explicit follow-up hint, use that
  if (structuredData?.callbackTime) {
    return structuredData.callbackTime
  }

  const daysOut = days[outcome] ?? 7
  if (daysOut === null) return '—'

  const d = new Date()
  d.setDate(d.getDate() + daysOut)
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
}

// ─── OUTCOME → STATUS ────────────────────────────────────────
function outcomeToStatus(outcome) {
  const map = {
    appointment_booked: STATUS.DONE,
    urgent_escalated:   STATUS.DONE,
    transferred:        STATUS.DONE,
    lead_saved:         STATUS.DONE,
    inquiry_only:       STATUS.DONE,
    no_action:          STATUS.RETRY,
    unknown:            STATUS.RETRY,
  }
  return map[outcome] || STATUS.DONE
}

// ─── URGENT ALERT ────────────────────────────────────────────
async function sendUrgentAlert({ name, phone, company, problem, outcome }) {
  const text = [
    `🚨 *URGENT LEAD — Shanvox Dialer*`,
    `*Name:*    ${name}`,
    `*Phone:*   ${phone}`,
    `*Company:* ${company || 'N/A'}`,
    `*Issue:*   ${problem}`,
    `*Outcome:* ${outcome}`,
    `*Time:*    ${nowIST()}`,
  ].join('\n')

  // Slack
  if (process.env.SLACK_WEBHOOK_URL) {
    await slackPost(text)
  }

  // WhatsApp via Twilio
  if (process.env.TWILIO_ACCOUNT_SID && process.env.OWNER_WHATSAPP) {
    await whatsappAlert(text)
  }
}

async function slackPost(text) {
  const payload = JSON.stringify({ text })
  const url     = new URL(process.env.SLACK_WEBHOOK_URL)

  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, resolve)
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function whatsappAlert(text) {
  const { default: twilio } = await import('twilio')
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

  await client.messages.create({
    body: text,
    from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
    to:   `whatsapp:${process.env.OWNER_WHATSAPP}`,
  })
}

// ─── UTILS ───────────────────────────────────────────────────
function normalizePhone(raw) {
  // Strip spaces, dashes, brackets
  let cleaned = raw.replace(/[\s\-().]/g, '')

  // Already E.164
  if (/^\+\d{10,15}$/.test(cleaned)) return cleaned

  // Indian number without country code
  if (/^[6-9]\d{9}$/.test(cleaned)) return `+91${cleaned}`
  if (/^0[6-9]\d{9}$/.test(cleaned)) return `+91${cleaned.slice(1)}`
  if (/^91[6-9]\d{9}$/.test(cleaned)) return `+${cleaned}`

  return null // invalid
}

function nowIST() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
