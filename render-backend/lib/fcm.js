const { messaging } = require('./firebase')

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function sendAlert(tokens, opts) {
  const valid = (tokens || []).filter(Boolean)
  if (valid.length === 0) return

  const data = {
    type: opts.type,
    requestId: opts.requestId,
    title: opts.title,
    body: opts.body,
    ...(opts.extra || {}),
  }

  const results = await Promise.all(
    chunk(valid, 500).map((batch) =>
      messaging.sendEachForMulticast({
        tokens: batch,
        data,
        notification: { title: opts.title, body: opts.body },
        android: {
          priority: 'high',
          notification: {
            channelId: 'emergency_requests',
            sound: 'default',
            priority: 'max',
            visibility: 'public',
            defaultVibrateTimings: true,
            tag: opts.requestId,
          },
        },
        apns: {
          headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
          payload: {
            aps: {
              alert: { title: opts.title, body: opts.body },
              sound: 'default',
              'content-available': 1,
            },
          },
        },
      })
    )
  )

  const failed = results.reduce((n, r) => n + r.failureCount, 0)
  if (failed > 0) {
    console.warn(`sendAlert(${opts.type}): ${failed}/${valid.length} token(s) failed`)
  }
}

async function sendSilentData(tokens, data) {
  const valid = (tokens || []).filter(Boolean)
  if (valid.length === 0) return

  await Promise.all(
    chunk(valid, 500).map((batch) =>
      messaging.sendEachForMulticast({
        tokens: batch,
        data,
        android: { priority: 'high' },
        apns: {
          headers: { 'apns-priority': '5', 'apns-push-type': 'background' },
          payload: { aps: { 'content-available': 1 } },
        },
      })
    )
  )
}

module.exports = { sendAlert, sendSilentData }
