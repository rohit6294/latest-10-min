import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { geohashQueryBounds, distanceBetween } from "geofire-common";
import { enqueueDriverTimeout } from "./taskHelpers";
import { sendAlert } from "./fcm";

const db = admin.firestore();

export interface NearbySearchParams {
  requestId: string;
  lat: number;
  lng: number;
  searchRadius: number;
  alreadyNotified: string[];
}

function buildAlertText(
  request: FirebaseFirestore.DocumentData | undefined
): { title: string; body: string } {
  const urgency = (request?.urgencyLevel as string) || "";
  const type =
    (request?.emergencyType as string) ||
    (request?.emergencyDescription as string) ||
    "Emergency";
  const urgencyLabel =
    urgency === "critical"
      ? "CRITICAL"
      : urgency === "serious"
        ? "SERIOUS"
        : "New";
  return {
    title: `${urgencyLabel} ambulance request`,
    body: `${type} — tap to respond`,
  };
}

/**
 * Core logic: find nearby available drivers, push an emergency alert,
 * and enqueue a 30-second timeout for radius expansion.
 * Exported for reuse by onRescueRequestCreated and onDriverTimeout.
 */
export async function findNearbyDriversInternal(
  params: NearbySearchParams
): Promise<{ notified: number }> {
  const { requestId, lat, lng, searchRadius, alreadyNotified } = params;
  const requestSnap = await db.collection("rescue_requests").doc(requestId).get();
  const request = requestSnap.data() || {};
  const declinedDriverIds = new Set(
    ((request.declinedDriverIds as string[]) || [])
  );
  const requiredAmbulanceType =
    (request.ambulanceType as string | undefined) || null;
  const seenDriverIds = new Set(alreadyNotified || []);
  const seenTokens = new Set<string>();

  const bounds = geohashQueryBounds([lat, lng], searchRadius * 1000);
  const snapshots = await Promise.all(
    bounds.map((b) =>
      db
        .collection("drivers")
        .where("geohash", ">=", b[0])
        .where("geohash", "<=", b[1])
        .where("isOnline", "==", true)
        .where("isAvailable", "==", true)
        .get()
    )
  );

  const newDriverIds: string[] = [];
  const fcmTokens: string[] = [];

  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      const driver = doc.data();
      const driverLoc = driver.location as
        | admin.firestore.GeoPoint
        | undefined;
      if (!driverLoc) continue;
      if (
        requiredAmbulanceType &&
        driver.ambulanceType !== requiredAmbulanceType
      ) {
        continue;
      }
      const dist = distanceBetween(
        [driverLoc.latitude, driverLoc.longitude],
        [lat, lng]
      );
      if (
        dist <= searchRadius &&
        !seenDriverIds.has(doc.id) &&
        !declinedDriverIds.has(doc.id)
      ) {
        seenDriverIds.add(doc.id);
        newDriverIds.push(doc.id);
        if (
          driver.fcmToken &&
          !seenTokens.has(driver.fcmToken as string)
        ) {
          seenTokens.add(driver.fcmToken as string);
          fcmTokens.push(driver.fcmToken as string);
        }
      }
    }
  }

  if (newDriverIds.length > 0) {
    await db.collection("rescue_requests").doc(requestId).update({
      notifiedDriverIds:
        admin.firestore.FieldValue.arrayUnion(...newDriverIds),
    });

    const { title, body } = buildAlertText(request);

    await sendAlert(fcmTokens, {
      type: "incoming_request",
      requestId,
      title,
      body,
    });
  }

  // Enqueue 30-second timeout for radius expansion. Non-fatal: drivers have
  // already been alerted above, so a Cloud Tasks hiccup must not break that.
  try {
    await enqueueDriverTimeout(requestId, searchRadius);
  } catch (e) {
    console.error(`enqueueDriverTimeout failed for ${requestId}:`, e);
  }

  return { notified: newDriverIds.length };
}

/**
 * HTTPS Callable — kept for manual/testing use. The automatic entry point
 * is the onRescueRequestCreated Firestore trigger.
 */
export const findNearbyDrivers = functions
  .region("asia-south1")
  .https.onCall(async (data: NearbySearchParams) => {
    return findNearbyDriversInternal(data);
  });
