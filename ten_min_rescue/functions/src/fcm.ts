import * as admin from "firebase-admin";

const messaging = admin.messaging();

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface AlertOptions {
  type: string;
  requestId: string;
  title: string;
  body: string;
  extra?: Record<string, string>;
}

/**
 * Send a high-priority hybrid push (notification + data) to many devices.
 *
 * The top-level `notification` block lets Android/iOS ring reliably even
 * when the app process is frozen by OEM battery savers (MIUI, ColorOS,
 * etc.). The data block carries `requestId` so that — whether the user
 * taps the system notification or the app's own isolate handles the push
 * while alive — the app routes to the rich in-app request screen which
 * fetches the full patient text + voice note from Firestore.
 */
export async function sendAlert(
  tokens: Array<string | undefined | null>,
  opts: AlertOptions
): Promise<void> {
  const valid = tokens.filter((t): t is string => !!t);
  if (valid.length === 0) return;

  const data: Record<string, string> = {
    type: opts.type,
    requestId: opts.requestId,
    title: opts.title,
    body: opts.body,
    ...(opts.extra ?? {}),
  };

  const results = await Promise.all(
    chunk(valid, 500).map((batch) =>
      messaging.sendEachForMulticast({
        tokens: batch,
        data,
        notification: { title: opts.title, body: opts.body },
        android: {
          priority: "high",
          notification: {
            channelId: "emergency_requests",
            sound: "default",
            priority: "max",
            visibility: "public",
            defaultVibrateTimings: true,
            tag: opts.requestId,
          },
        },
        apns: {
          headers: {
            "apns-priority": "10",
            "apns-push-type": "alert",
          },
          payload: {
            aps: {
              alert: { title: opts.title, body: opts.body },
              sound: "default",
              "content-available": 1,
            },
          },
        },
      })
    )
  );

  const failed = results.reduce((n, r) => n + r.failureCount, 0);
  if (failed > 0) {
    console.warn(
      `sendAlert(${opts.type}): ${failed}/${valid.length} token(s) failed`
    );
  }
}

/**
 * Send a lightweight silent data message — e.g. to dismiss the incoming
 * alert on drivers who did not win the request.
 */
export async function sendSilentData(
  tokens: Array<string | undefined | null>,
  data: Record<string, string>
): Promise<void> {
  const valid = tokens.filter((t): t is string => !!t);
  if (valid.length === 0) return;

  await Promise.all(
    chunk(valid, 500).map((batch) =>
      messaging.sendEachForMulticast({
        tokens: batch,
        data,
        android: { priority: "high" },
        apns: {
          headers: { "apns-priority": "5", "apns-push-type": "background" },
          payload: { aps: { "content-available": 1 } },
        },
      })
    )
  );
}
