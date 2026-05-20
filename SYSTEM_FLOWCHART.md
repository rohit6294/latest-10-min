# SURAKSHA KAVACH — COMPLETE SYSTEM FLOWCHART
**Last Updated:** 2026-05-10
**Version:** 2.0 (Post-Upgrade)

---

## 🏗️ SYSTEM ARCHITECTURE OVERVIEW

```
┌──────────────────────────────────────────────────────────────────────┐
│                      SURAKSHA KAVACH PLATFORM                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│   │  WEBSITE     │    │  FLUTTER APP │    │   FIREBASE   │         │
│   │  (React)     │    │  (Android)   │    │   (Backend)  │         │
│   ├──────────────┤    ├──────────────┤    ├──────────────┤         │
│   │ • Landing    │    │ • Driver App │    │ • Firestore  │         │
│   │ • /sos       │◄──►│ • Hospital   │◄──►│ • Auth       │         │
│   │ • /callback  │    │   App        │    │ • Storage    │         │
│   │ • /admin     │    │              │    │ • Hosting    │         │
│   │ • /hospital  │    │              │    │              │         │
│   └──────────────┘    └──────────────┘    └──────────────┘         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 👥 USER TYPES IN SYSTEM

| User Type | Access Point | Authentication |
|-----------|--------------|----------------|
| **Patient/Customer** | Website (/sos, /callback), WhatsApp | None (anonymous) |
| **Ambulance Driver** | Flutter App | Email + Password |
| **Hospital Staff** | Web Dashboard + Flutter App | Email + Password |
| **Admin/Operator** | Web Dashboard (/admin) | Email + Password (admins/{uid} doc required) |

---

## 🚑 AMBULANCE TYPES

| Code | Type | Equipment | Use Case |
|------|------|-----------|----------|
| **A** | ICU Ambulance | Ventilator, cardiac monitor, life support | Critical patients (cardiac arrest, unconscious, severe trauma) |
| **B** | Advanced | Oxygen, defibrillator, advanced monitoring | Serious cases (heavy bleeding, breathing issues) |
| **C** | Normal | Basic first aid, stretcher | Stable patients (transport, minor injuries) |

---

## 🎨 URGENCY COLOR CODING

| Level | Color | Visual | Meaning |
|-------|-------|--------|---------|
| **Critical** | 🔴 Red `#FF3B3B` | Pulsing red | Life-threatening, immediate response |
| **Serious** | 🟡 Amber `#F59E0B` | Solid amber | Needs urgent care, not life-threatening |
| **Stable** | 🟢 Green `#16A34A` | Solid green | Transport needed, not urgent |

---

# 📍 FLOW 1: PATIENT EMERGENCY SOS (Web Wizard)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PATIENT VISITS /sos                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 1 — EMERGENCY INFO                                             │
│                                                                      │
│  📝 "What happened?" (textarea, required, min 10 chars)             │
│                                                                      │
│  Select Urgency:                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                          │
│  │ 🔴       │  │ 🟡       │  │ 🟢       │                          │
│  │ CRITICAL │  │ SERIOUS  │  │ STABLE   │                          │
│  └──────────┘  └──────────┘  └──────────┘                          │
│                                                                      │
│  [Next →]                                                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 2 — AMBULANCE TYPE SELECTION                                   │
│                                                                      │
│  Auto pre-select based on urgency:                                   │
│   Critical → Type A (ICU)                                            │
│   Serious  → Type B (Advanced)                                       │
│   Stable   → Type C (Normal)                                         │
│                                                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                    │
│  │ 🚑 TYPE A  │  │ 🚑 TYPE B  │  │ 🚑 TYPE C  │                    │
│  │ ICU        │  │ Advanced   │  │ Normal     │                    │
│  │ Ventilator │  │ Oxygen     │  │ Basic      │                    │
│  └────────────┘  └────────────┘  └────────────┘                    │
│                                                                      │
│  [← Back]  [Next →]                                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ 📍 Trigger GPS in BG │
                    │  (while user reads)  │
                    └──────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 3 — SELECT HOSPITAL                                            │
│                                                                      │
│  Query Firestore:                                                    │
│   - hospitals where isActive == true                                 │
│   - Filter: availableBedsForType(selectedType) > 0                   │
│   - Sort by rating DESC                                              │
│   - Compute distance using Haversine                                 │
│                                                                      │
│  ⚡ Let System Decide (fastest)                                      │
│  ─────────────────────────────                                       │
│  🏥 Apollo Multispeciality      ⭐ 4.8                              │
│     2 ICU beds available  •  3.2 km                                  │
│  ─────────────────────────────                                       │
│  🏥 AMRI Hospitals               ⭐ 4.6                              │
│     1 ICU bed available   •  5.1 km                                  │
│  ─────────────────────────────                                       │
│  🏥 Fortis Anandapur             ⭐ 4.7                              │
│     5 ICU beds available  •  7.8 km                                  │
│                                                                      │
│  [← Back]  [Next →]                                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 4 — CONFIRM & SEND                                             │
│                                                                      │
│  Summary:                                                            │
│   Emergency: "Father collapsed in chest pain"                        │
│   Urgency:   🔴 CRITICAL                                            │
│   Ambulance: TYPE A — ICU                                            │
│   Hospital:  Apollo Multispeciality                                  │
│   Location:  22.5726, 88.3639  (auto-captured)                      │
│                                                                      │
│  ┌────────────────────────────────┐                                 │
│  │   🚨  SEND SOS NOW             │                                 │
│  └────────────────────────────────┘                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  💾 WRITE TO FIRESTORE                                               │
│                                                                      │
│  Collection: sos_requests                                            │
│  Document {                                                          │
│    latitude: 22.5726,                                                │
│    longitude: 88.3639,                                               │
│    accuracy: 15,                                                     │
│    mapsLink: "https://maps.google.com/?q=...",                      │
│    ambulanceType: "A",                                              │
│    urgencyLevel: "critical",                                        │
│    emergencyDescription: "Father collapsed...",                      │
│    preferredHospitalId: "apollo_kolkata_uid",                       │
│    patientName: "",                                                  │
│    patientPhone: "",                                                 │
│    status: "pending",                                                │
│    source: "web_sos_page",                                           │
│    createdAt: serverTimestamp(),                                     │
│    device: "Mozilla/5.0 ..."                                         │
│  }                                                                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ✅ STEP 5 — DONE                                                    │
│                                                                      │
│  "Help is coming! 🚨"                                                │
│   • Your location has been saved                                     │
│   • Nearest TYPE A driver is being notified                          │
│   • Apollo Multispeciality has been alerted                          │
│   • Keep your phone with you                                         │
│   • A team member will call shortly                                  │
│                                                                      │
│  [📍 View My Location]  [📞 Call +91 78660 67136]                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

# 📞 FLOW 2: PATIENT CALLBACK REQUEST

```
┌─────────────────────────────────────────────────────────────────────┐
│                  PATIENT VISITS /callback                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CALLBACK FORM                                                       │
│                                                                      │
│  Name:        [_____________________]  *required                    │
│  Phone:       [+91___________________]  *required                   │
│  Description: [_____________________]                               │
│               [_____________________]                               │
│                                                                      │
│  Ambulance Type:  ○ A   ○ B   ● C                                   │
│  Urgency:         ○ Critical  ○ Serious  ● Stable                  │
│                                                                      │
│  [Submit Callback Request]                                           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  💾 WRITE TO FIRESTORE                                               │
│                                                                      │
│  Collection: callback_requests                                       │
│  Document {                                                          │
│    patientName: "Rohit Kumar",                                       │
│    patientPhone: "+919876543210",                                    │
│    emergencyDescription: "Need ambulance for transport",            │
│    ambulanceType: "C",                                              │
│    urgencyLevel: "stable",                                          │
│    status: "pending_call",                                          │
│    adminNote: "",                                                    │
│    createdAt: serverTimestamp(),                                     │
│    calledAt: null,                                                   │
│    convertedRequestId: null                                          │
│  }                                                                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ✅ SUCCESS PAGE                                                     │
│                                                                      │
│  "We'll call you within 2 minutes"                                   │
│  📞 Or call us now: +91 78660 67136                                  │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    [Admin sees in dashboard]
                               │
                               ▼
                    [See FLOW 8: Admin Callback Handling]
```

---

# 💬 FLOW 3: WHATSAPP CHANNEL

```
┌─────────────────────────────────────────────────────────────────────┐
│            PATIENT MESSAGES +91 78660 67136 ON WHATSAPP             │
│                  (or clicks WhatsApp button on website)              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  📲 WHATSAPP BUSINESS APP — AUTO AWAY MESSAGE                        │
│                                                                      │
│  "Thank you for contacting Suraksha Kavach! 🚨                        │
│   For IMMEDIATE ambulance help, share your location:                 │
│   👉 min-rescue.web.app/sos                                          │
│                                                                      │
│   This link takes 10 seconds and directly alerts                     │
│   our nearest driver.                                                │
│                                                                      │
│   Or call: +91 78660 67136"                                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
                    [Patient taps the link]
                               │
                               ▼
                    [Goes to FLOW 1: SOS Wizard]
```

---

# 👨‍✈️ FLOW 4: DRIVER REGISTRATION & ONBOARDING

```
┌─────────────────────────────────────────────────────────────────────┐
│              DRIVER OPENS APP → /splash → /auth/login                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   New Driver?        │
                    └──────────┬───────────┘
                               │
                  ┌────────────┴────────────┐
                  │                         │
                YES                         NO
                  │                         │
                  ▼                         ▼
       ┌──────────────────┐        ┌──────────────────┐
       │  /auth/register  │        │   /auth/login    │
       └─────────┬────────┘        └────────┬─────────┘
                 │                          │
                 ▼                          ▼
┌──────────────────────────────┐   ┌──────────────────────┐
│  REGISTRATION FORM            │   │ Email + Password     │
│                               │   └──────────┬───────────┘
│  • Full Name                  │              │
│  • Email                      │              ▼
│  • Phone                      │   ┌──────────────────────┐
│  • Password                   │   │ Firebase Auth        │
│  • Vehicle Number             │   └──────────┬───────────┘
│  • License Number             │              │
│                               │              ▼
│  📍 NEW: Ambulance Type       │   ┌──────────────────────┐
│  ┌──────┐ ┌──────┐ ┌──────┐  │   │ Read drivers/{uid}   │
│  │ ⭕ A │ │ ⭕ B │ │ ✅ C │  │   └──────────┬───────────┘
│  │ ICU  │ │ Adv. │ │ Norm.│  │              │
│  └──────┘ └──────┘ └──────┘  │              ▼
│                               │       Verification Status?
│  [Register]                   │              │
└──────────────┬────────────────┘     ┌────────┼─────────┐
               │                      │        │         │
               ▼                  pending  verified   rejected
┌──────────────────────────────┐      │        │         │
│  Firebase Auth → createUser  │      ▼        │         ▼
│  Firestore writes:           │  /upload-     │   Show rejection
│   • users/{uid}              │   docs        │   reason + retry
│   • drivers/{uid} {          │               │
│       ambulanceType: "C",    │               ▼
│       verificationStatus:    │       /driver/home
│         "pending",           │
│       documents: {},         │
│       isOnline: false,       │
│       isAvailable: true      │
│     }                        │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  /driver/upload-docs         │
│                              │
│  Upload:                     │
│   • Driving License          │
│   • Vehicle RC               │
│   • Insurance                │
│   • Aadhaar                  │
│                              │
│  → Firebase Storage          │
│  → Update drivers/{uid}      │
│      .documents map          │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  WAITING FOR ADMIN APPROVAL  │
│  (verificationStatus:        │
│   "pending")                 │
└──────────┬───────────────────┘
           │
           ▼
        [See FLOW 9: Admin Verification]
```

---

# 🚗 FLOW 5: DRIVER GOING ONLINE & RECEIVING REQUESTS

```
┌─────────────────────────────────────────────────────────────────────┐
│           DRIVER LOGGED IN → /driver/home                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DRIVER HOME SCREEN                                                  │
│                                                                      │
│  Status: OFFLINE  [Tap to go ONLINE]                                 │
│                                                                      │
│  Driver Info:                                                        │
│   Name: Rohit Sharma                                                 │
│   Vehicle: WB-01-AB-1234                                             │
│   🚑 Type: ICU (A)  ← shown prominently                             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                          [Tap GO ONLINE]
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Permission Check:                                                   │
│   • GPS permission?                                                  │
│   • Background location?                                             │
│  Update drivers/{uid}: {isOnline: true, isAvailable: true}          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  REAL-TIME FIRESTORE LISTENERS START:                                │
│                                                                      │
│  Stream 1: watchPendingSosRequests()                                 │
│   Query: sos_requests where status == 'pending'                      │
│   Filter (client-side): ambulanceType == driver.ambulanceType        │
│                                                                      │
│  Stream 2: watchPendingDriverRequests()                              │
│   Query: rescue_requests where status == 'pending_driver'            │
│   Filter (client-side): ambulanceType == driver.ambulanceType        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Request Arrives?   │
                    └──────────┬───────────┘
                               │
                  ┌────────────┴────────────┐
                  │                         │
              SOS REQUEST              RESCUE REQUEST
                  │                         │
                  ▼                         ▼
┌──────────────────────────┐   ┌──────────────────────────────┐
│  PULSING SOS ALERT CARD  │   │  AUTO-NAVIGATE TO            │
│  (in driver home)        │   │  /driver/request/:id         │
│                          │   │                              │
│  🔴 Red border + glow    │   │  Full-screen popup with:     │
│  (urgency: critical)     │   │  • 30s countdown             │
│                          │   │  • Color by urgency          │
│  🚨 EMERGENCY SOS        │   │   ◦ critical → Red gradient  │
│  TYPE A — ICU            │   │   ◦ serious  → Amber gradient│
│  Description: ...        │   │   ◦ stable   → Green gradient│
│  Distance: 2.3 km        │   │  • Patient name + phone      │
│                          │   │  • Distance to patient       │
│  [Accept & Navigate]     │   │  • Emergency type            │
└──────────┬───────────────┘   │  • Hospital destination      │
           │                   │  • [Accept] [Decline]        │
           │                   └──────────┬───────────────────┘
           │                              │
           ▼                              ▼
[See FLOW 6A: SOS Active]        [See FLOW 6B: Rescue Flow]
```

---

# 🏥 FLOW 6A: DRIVER ACCEPTS SOS REQUEST

```
[Driver taps "Accept & Navigate" on SOS card]
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Firestore Transaction:                                              │
│   Update sos_requests/{id}:                                          │
│     status: "assigned"                                               │
│     driverId: <driverUid>                                            │
│     assignedAt: serverTimestamp()                                    │
│   Update drivers/{uid}:                                              │
│     isAvailable: false                                               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Navigate to /driver/sos/:sosId                                      │
│  → SosActiveScreen                                                   │
│                                                                      │
│  ┌─────────────────────────────────────┐                            │
│  │  🚨 ACTIVE SOS                       │                            │
│  ├─────────────────────────────────────┤                            │
│  │                                     │                            │
│  │       🗺️  OPENSTREETMAP             │                            │
│  │                                     │                            │
│  │       🔴 Customer (pulsing)         │                            │
│  │            │                        │                            │
│  │            └── route line ──────    │                            │
│  │                                │    │                            │
│  │                              🔵 You │                            │
│  │                                     │                            │
│  ├─────────────────────────────────────┤                            │
│  │  Distance: 3.2 km   ETA: ~5 min    │                            │
│  │  📍 22.5726, 88.3639               │                            │
│  ├─────────────────────────────────────┤                            │
│  │  [🧭 Navigate with Google Maps]    │                            │
│  │  [✅ Mission Complete]              │                            │
│  └─────────────────────────────────────┘                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                  [Driver completes mission]
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Update sos_requests/{id}: status: "resolved"                        │
│  Update drivers/{uid}: isAvailable: true                             │
│  Navigate back to /driver/home                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

# 🏥 FLOW 6B: DRIVER ACCEPTS RESCUE REQUEST (Full Hospital Flow)

```
[Driver taps "Accept" on incoming request popup]
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Firestore Transaction (race-condition safe):                        │
│   Read rescue_requests/{id}                                          │
│   IF assignedDriverId != null → ABORT (someone else got it)         │
│   ELSE Update:                                                       │
│     assignedDriverId: <driverUid>                                    │
│     assignedDriverAcceptedAt: serverTimestamp()                      │
│     status: "driver_assigned"                                        │
│   Update drivers/{uid}:                                              │
│     isAvailable: false                                               │
│     currentRequestId: <reqId>                                        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  /driver/navigate-patient/:requestId                                 │
│  → NavigateToPatientScreen                                           │
│                                                                      │
│  Map showing:                                                        │
│   • Driver location (live)                                           │
│   • Patient location (red pin)                                       │
│   • Route polyline                                                   │
│  Bottom sheet: distance, ETA, [Open Google Maps]                     │
│                                                                      │
│  [Confirm Patient Pickup]                                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                  [Driver arrives & picks up patient]
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  /driver/pickup-confirm/:requestId                                   │
│  → PatientPickedUpScreen                                             │
│                                                                      │
│  Update rescue_requests/{id}:                                        │
│    status: "patient_picked_up"                                       │
│    patientPickedUpAt: serverTimestamp()                              │
│                                                                      │
│  IF preferredHospitalId is set:                                      │
│    Update status → "hospital_assigned"                               │
│    Set assignedHospitalId = preferredHospitalId                      │
│  ELSE:                                                               │
│    Update status → "pending_hospital"                                │
│    (Hospitals will be notified via watchPendingHospitalRequests)     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                  [Hospital accepts (FLOW 7B)]
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  /driver/navigate-hospital/:requestId                                │
│  → NavigateToHospitalScreen                                          │
│                                                                      │
│  Map: driver → hospital                                              │
│  Status changes to "in_transit"                                      │
│                                                                      │
│  Hospital sees driver moving (FLOW 7C: Track Ambulance)              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                  [Driver arrives at hospital]
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  /driver/ride-complete                                               │
│  → RideCompleteScreen                                                │
│                                                                      │
│  Update rescue_requests/{id}:                                        │
│    status: "completed"                                               │
│    completedAt: serverTimestamp()                                    │
│  Update drivers/{uid}:                                               │
│    isAvailable: true                                                 │
│    currentRequestId: null                                            │
│  Update hospitals/{hospitalId}:                                      │
│    Decrement availableBeds for matching ambulance type               │
│    (e.g., icuAvailable: icuAvailable - 1)                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

# 🏥 FLOW 7: HOSPITAL FLOWS

## 7A. Hospital Login & Bed Management

```
┌─────────────────────────────────────────────────────────────────────┐
│               HOSPITAL LOGIN (Web at /hospital)                      │
│            OR (Flutter App with hospital credentials)                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Firebase Auth                                                       │
│  Read hospitals/{uid} document                                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                  ┌────────────┴────────────┐
                  │                         │
                Web                       Flutter
                  │                         │
                  ▼                         ▼
       /hospital/dashboard          /hospital/home
                  │                         │
                  └─────────────┬───────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  HOSPITAL DASHBOARD                                                  │
│                                                                      │
│  ┌──────────────────────────────────────────────────┐              │
│  │  🏥 BED AVAILABILITY                              │              │
│  ├──────────────────────────────────────────────────┤              │
│  │  ICU       [ − ]   2 / 10   [ + ]                │              │
│  │  Advanced  [ − ]   8 / 20   [ + ]                │              │
│  │  Normal    [ − ]  15 / 50   [ + ]                │              │
│  └──────────────────────────────────────────────────┘              │
│                                                                      │
│  Tabs: [Incoming] [Active Cases] [History]                           │
│                                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                  [Tap +/- buttons]
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Update Firestore hospitals/{uid}:                                   │
│    icuAvailable: <new value>                                         │
│    OR advancedAvailable: <new value>                                 │
│    OR normalAvailable: <new value>                                   │
│    (Clamped: 0 ≤ available ≤ total)                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## 7B. Hospital Receives Incoming Ambulance

```
                    [Driver picks up patient]
                               │
                               ▼
                    Hospital app listening:
                    watchPendingHospitalRequests() OR
                    watchActiveRequestForHospital()
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  HOSPITAL APP — INCOMING AMBULANCE NOTIFICATION                      │
│  /hospital/ambulance/:requestId                                      │
│                                                                      │
│  ⏱️  30-second countdown                                             │
│                                                                      │
│  🚑 INCOMING AMBULANCE                                               │
│  Patient: John Doe                                                   │
│  Phone: +91 98765 43210                                              │
│  Emergency: Cardiac arrest                                           │
│  Urgency: 🔴 CRITICAL                                                │
│  Ambulance Type: A (ICU)                                             │
│  ETA: ~8 minutes                                                     │
│  Distance: 4.2 km                                                    │
│                                                                      │
│  [Decline]              [✓ ACCEPT]                                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                          [Accept]
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Firestore Transaction:                                              │
│   IF assignedHospitalId != null → ABORT                             │
│   ELSE Update rescue_requests/{id}:                                  │
│     assignedHospitalId: <hospitalUid>                                │
│     assignedHospitalAcceptedAt: serverTimestamp()                    │
│     status: "hospital_assigned"                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
                    [Goes to FLOW 7C]
```

## 7C. Hospital Tracks Ambulance Live

```
┌─────────────────────────────────────────────────────────────────────┐
│  /hospital/track/:requestId                                          │
│  → TrackAmbulanceScreen                                              │
│                                                                      │
│  ┌──────────────────────────────────────────────────┐              │
│  │                                                  │              │
│  │            🗺️  LIVE MAP                          │              │
│  │                                                  │              │
│  │     🏥 Hospital (you)                            │              │
│  │           │                                      │              │
│  │           └── route ──────                       │              │
│  │                          │                       │              │
│  │                        🚑 Ambulance              │              │
│  │                       (live updating)            │              │
│  │                                                  │              │
│  └──────────────────────────────────────────────────┘              │
│                                                                      │
│  Distance: 2.1 km    ETA: 4 min                                     │
│                                                                      │
│  [Open Intake Checklist]                                             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  /hospital/checklist/:requestId                                      │
│  → IntakeChecklistScreen                                             │
│                                                                      │
│  ☑️ Trauma bay prepared                                              │
│  ☑️ Doctor notified                                                  │
│  ☑️ Medications ready                                                │
│  ☑️ Bed assigned                                                     │
│                                                                      │
│  [Mark Patient Received]                                             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                  [Patient arrives & received]
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  /hospital/received                                                  │
│                                                                      │
│  Update rescue_requests/{id}:                                        │
│    status: "completed"                                               │
│    completedAt: serverTimestamp()                                    │
│                                                                      │
│  Decrement bed count:                                                │
│    if ambulanceType == "A" → icuAvailable -= 1                       │
│    if ambulanceType == "B" → advancedAvailable -= 1                  │
│    if ambulanceType == "C" → normalAvailable -= 1                    │
│                                                                      │
│  ✅ "Patient Received Successfully"                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

# 🛡️ FLOW 8: ADMIN DASHBOARD FLOWS

## 8A. Admin Login

```
┌─────────────────────────────────────────────────────────────────────┐
│             ADMIN VISITS /admin (web)                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Email + Password form                                               │
│   ↓                                                                  │
│  Firebase Auth signIn                                                │
│   ↓                                                                  │
│  Read admins/{uid} document                                          │
│   IF NOT EXISTS → Sign out + show error                              │
│   ELSE → Redirect to /admin/dashboard                                │
└─────────────────────────────────────────────────────────────────────┘
```

## 8B. Admin Dashboard — All Tabs

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ADMIN DASHBOARD                                  │
│  Tabs: 6 total                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  TAB 1: 📋 PENDING VERIFICATION                                      │
│   ┌──────────────────────────────────────────────────────┐         │
│   │ Driver Cards (verificationStatus == "pending")        │         │
│   │ • Name, Phone, Vehicle                                │         │
│   │ • View Documents (modal)                              │         │
│   │ • [Approve] [Reject with reason]                      │         │
│   └──────────────────────────────────────────────────────┘         │
│                                                                      │
│  TAB 2: 👨‍✈️ ALL DRIVERS                                              │
│   ┌──────────────────────────────────────────────────────┐         │
│   │ Filter: All / Online / Verified / Pending             │         │
│   │ Table: Name, Phone, Type, Status, Online, Available   │         │
│   │ Actions: Toggle availability                          │         │
│   └──────────────────────────────────────────────────────┘         │
│                                                                      │
│  TAB 3: 🏥 HOSPITALS  ← UPGRADED                                    │
│   ┌──────────────────────────────────────────────────────┐         │
│   │ Table: Name, Phone, ICU(A/T), Adv(A/T), Norm(A/T),    │         │
│   │        Rating, Active                                 │         │
│   │ [Edit Beds] button per row →                          │         │
│   │   Modal:                                              │         │
│   │    icuBeds, icuAvailable                              │         │
│   │    advancedBeds, advancedAvailable                    │         │
│   │    normalBeds, normalAvailable                        │         │
│   │    rating (0.0 to 5.0)                                │         │
│   │   [Save]                                              │         │
│   └──────────────────────────────────────────────────────┘         │
│                                                                      │
│  TAB 4: 🚑 ALL REQUESTS                                              │
│   ┌──────────────────────────────────────────────────────┐         │
│   │ Live table of rescue_requests                         │         │
│   │ Status badges with correct labels:                    │         │
│   │   pending_driver → Finding Driver (amber)             │         │
│   │   driver_assigned → Driver En Route (blue)            │         │
│   │   patient_picked_up → Patient Picked Up (purple)      │         │
│   │   pending_hospital → Needs Hospital (orange)          │         │
│   │   hospital_assigned → Hospital Assigned (indigo)      │         │
│   │   in_transit → In Transit (cyan)                      │         │
│   │   completed → Completed (green)                       │         │
│   │   cancelled → Cancelled (gray)                        │         │
│   └──────────────────────────────────────────────────────┘         │
│                                                                      │
│  TAB 5: 🚨 SOS REQUESTS                                              │
│   ┌──────────────────────────────────────────────────────┐         │
│   │ Real-time cards from sos_requests                     │         │
│   │ • Ambulance type badge (A/B/C)                        │         │
│   │ • Urgency badge (red/amber/green)                     │         │
│   │ • Description                                         │         │
│   │ • Preferred Hospital name                             │         │
│   │ • Maps link                                           │         │
│   │ • [Mark Resolved]                                     │         │
│   └──────────────────────────────────────────────────────┘         │
│                                                                      │
│  TAB 6: 📞 CALLBACKS  ← NEW                                         │
│   ┌──────────────────────────────────────────────────────┐         │
│   │ [+ New Callback] (admin can manually add)             │         │
│   │ Cards from callback_requests:                         │         │
│   │ • Patient name + phone (📞 tap to call)              │         │
│   │ • Description                                         │         │
│   │ • Type + urgency badges                               │         │
│   │ • Status: pending_call/called/converted/cancelled     │         │
│   │ • Admin note (editable)                               │         │
│   │ Actions:                                              │         │
│   │   [Mark Called]                                       │         │
│   │   [Convert to Request] → creates rescue_request       │         │
│   │   [Cancel]                                            │         │
│   └──────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────┘
```

## 8C. Admin Verifies Driver Documents

```
[Admin clicks "View Docs" on pending driver card]
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Document Modal                                                      │
│   • Driving License (image preview)                                  │
│   • RC (image)                                                       │
│   • Insurance (image)                                                │
│   • Aadhaar (image)                                                  │
│                                                                      │
│  Decision:                                                           │
│   [Approve] OR [Reject + reason]                                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                  ┌────────────┴────────────┐
                  │                         │
                APPROVE                   REJECT
                  │                         │
                  ▼                         ▼
       Update drivers/{uid}:        Update drivers/{uid}:
       verificationStatus:          verificationStatus:
         "verified"                   "rejected"
       verifiedAt: now              rejectionReason: "..."
                  │                         │
                  ▼                         ▼
         Driver can now            Driver sees rejection
         go online                 + retry upload
```

## 8D. Admin Handles Callback

```
[Admin sees pending_call in Callbacks tab]
                  │
                  ▼
       [Admin taps phone link → calls patient]
                  │
                  ▼
       [Admin clicks "Mark Called"]
                  │
                  ▼
       Update callback_requests/{id}:
         status: "called"
         calledAt: serverTimestamp()
                  │
                  ▼
       Patient confirms they need ambulance
                  │
                  ▼
       [Admin clicks "Convert to Request"]
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Modal: Pre-filled rescue request form                               │
│   • Patient name, phone (from callback)                              │
│   • GPS coordinates (admin enters or fetches)                        │
│   • Emergency description (from callback)                            │
│   • Ambulance type (from callback)                                   │
│   • Urgency (from callback)                                          │
│  [Create Request]                                                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
       Create rescue_requests/{newId}:
         status: "pending_driver"
         source: "callback"
         (all fields)
                  │
                  ▼
       Update callback_requests/{id}:
         status: "converted"
         convertedRequestId: newId
                  │
                  ▼
       [Drivers (matching ambulance type) get notified]
```

---

# 📊 FLOW 9: DATA MODEL — FIRESTORE COLLECTIONS

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FIRESTORE DATABASE STRUCTURE                      │
└─────────────────────────────────────────────────────────────────────┘

📁 users/{uid}
   uid, email, displayName, phone
   role: "driver" | "hospital"
   createdAt, isActive

📁 drivers/{uid}
   uid, name, phone, vehicleNumber, licenseNumber
   ambulanceType: "A" | "B" | "C"  ← NEW
   isOnline, isAvailable
   location (GeoPoint), geohash
   currentRequestId
   verificationStatus: "pending" | "verified" | "rejected"
   rejectionReason
   documents: { license: url, rc: url, insurance: url, aadhaar: url }
   fcmToken, lastLocationUpdate

📁 hospitals/{uid}
   uid, name, phone, address, location, geohash
   isActive, fcmToken, currentRequestId
   specializations: [string]
   icuBeds, icuAvailable             ← NEW
   advancedBeds, advancedAvailable   ← NEW
   normalBeds, normalAvailable       ← NEW
   rating: 0.0 to 5.0                ← NEW

📁 rescue_requests/{requestId}
   requestId, patientName, patientPhone, patientLocation, emergencyType
   ambulanceType: "A" | "B" | "C"            ← NEW
   urgencyLevel: "critical"|"serious"|"stable"  ← NEW
   emergencyDescription                       ← NEW
   preferredHospitalId                        ← NEW
   source: "sos_web" | "callback" | "app"     ← NEW
   status: 8 states (see below)
   currentDriverSearchRadius, notifiedDriverIds, assignedDriverId
   currentHospitalSearchRadius, notifiedHospitalIds, assignedHospitalId
   createdAt, assignedDriverAcceptedAt, patientPickedUpAt
   assignedHospitalAcceptedAt, completedAt

📁 sos_requests/{sosId}
   id, latitude, longitude, accuracy, mapsLink
   ambulanceType, urgencyLevel        ← NEW
   emergencyDescription                ← NEW
   preferredHospitalId                 ← NEW
   patientName, patientPhone           ← NEW
   status: "pending" | "assigned" | "resolved"
   driverId, source, device
   createdAt, assignedAt, resolvedAt

📁 callback_requests/{callbackId}     ← NEW COLLECTION
   id, patientName, patientPhone
   emergencyDescription
   ambulanceType, urgencyLevel
   status: "pending_call" | "called" | "converted" | "cancelled"
   adminNote
   convertedRequestId
   createdAt, calledAt

📁 location_updates/{driverId}
   location (GeoPoint), heading, speed
   timestamp, requestId

📁 admins/{uid}
   role: "admin"
   (presence of doc grants admin access)
```

---

# 🔄 FLOW 10: REQUEST STATUS STATE MACHINE

```
                          ┌─────────────────┐
                          │  PATIENT SOS    │
                          │  CREATED        │
                          └────────┬────────┘
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │  pending_driver       │  ← initial state
                       │  (no driver assigned) │
                       └───────────┬───────────┘
                                   │
                          [Driver accepts]
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │  driver_assigned      │
                       │  (en route to patient)│
                       └───────────┬───────────┘
                                   │
                          [Driver picks up]
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │  patient_picked_up    │
                       └───────────┬───────────┘
                                   │
                  ┌────────────────┼────────────────┐
                  │                                 │
       (Hospital pre-selected)            (No hospital chosen)
                  │                                 │
                  ▼                                 ▼
       ┌──────────────────────┐         ┌──────────────────────┐
       │  hospital_assigned   │         │  pending_hospital    │
       │  (preferred selected)│         │  (finding hospital)  │
       └──────────┬───────────┘         └──────────┬───────────┘
                  │                                │
                  │              [Hospital accepts]│
                  │                                ▼
                  │                     ┌──────────────────────┐
                  │                     │  hospital_assigned   │
                  └────────────┬────────┴──────────────────────┘
                               │
                          [Driver en route to hospital]
                               │
                               ▼
                       ┌───────────────────────┐
                       │  in_transit           │
                       │  (heading to hospital)│
                       └───────────┬───────────┘
                                   │
                          [Patient delivered]
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │  completed            │
                       └───────────────────────┘

       At any point: → cancelled (by admin/system)
```

---

# 🌐 FLOW 11: COMPLETE END-TO-END EXAMPLE

**Scenario:** Father has cardiac arrest at home in Salt Lake, Kolkata.

```
═══════════════════════════════════════════════════════════════════════
TIMELINE: 0:00 — Family discovers patient unconscious
═══════════════════════════════════════════════════════════════════════

[0:00] Son opens browser → min-rescue.web.app
[0:05] Taps "🚨 Emergency SOS" button
[0:07] Page loads /sos wizard

[0:10] STEP 1: Types "Father unconscious, chest pain, not breathing well"
       Selects 🔴 CRITICAL
[0:25] STEP 2: Auto-selected TYPE A (ICU). Confirms.
[0:30] STEP 3: GPS captured (15m accuracy)
       System shows nearby hospitals with ICU beds:
        - Apollo Multispeciality (4.8 ⭐, 2 ICU beds, 3.2km)
        - AMRI Saltlake (4.5 ⭐, 1 ICU bed, 1.8km)
       Selects AMRI Saltlake (closer)
[0:40] STEP 4: Confirms summary
[0:42] Taps "🚨 SEND SOS NOW"

═══════════════════════════════════════════════════════════════════════
[0:43] FIRESTORE WRITE: sos_requests/{newId}
       {
         ambulanceType: "A", urgencyLevel: "critical",
         preferredHospitalId: "amri_saltlake_uid",
         status: "pending", ...
       }
═══════════════════════════════════════════════════════════════════════

[0:44] Driver A1 (Type A, online, 1.2km away) sees pulsing red SOS card
       in app: "🚨 EMERGENCY SOS — TYPE A — ICU — 1.2 km"
[0:48] Driver A1 taps "Accept & Navigate"

[0:48] FIRESTORE: sos_requests status → "assigned", driverId set
[0:49] Driver A1 sees full-screen map with route to patient
       Distance: 1.2 km, ETA: 3 min
[0:50] Driver taps "Navigate with Google Maps" → opens Maps app

[3:30] Driver arrives at patient location

═══════════════════════════════════════════════════════════════════════
[3:35] Driver picks up patient. (Note: SOS flow is simpler — no full
       rescue_request created. For full hospital handoff, admin can
       convert SOS to full rescue_request via admin panel)
═══════════════════════════════════════════════════════════════════════

[3:40] AMRI Saltlake hospital staff (Flutter app) sees notification
[3:42] Hospital taps "Accept" on incoming ambulance card
[3:45] Hospital tracks ambulance live on map (driver location updating)

[3:50] Hospital reviews intake checklist: trauma bay, doctor, meds, bed
[8:10] Driver arrives at AMRI Saltlake
[8:15] Hospital marks "Patient Received"

═══════════════════════════════════════════════════════════════════════
[8:15] FIRESTORE WRITES:
       - rescue_requests status → "completed"
       - drivers/A1: isAvailable: true
       - hospitals/AMRI: icuAvailable: 1 → 0 (decrement)
       - sos_requests status → "resolved"
═══════════════════════════════════════════════════════════════════════

TOTAL TIME: 8 minutes 15 seconds from SOS to hospital admission
```

---

# 🛠️ FLOW 12: HOSPITAL UPDATES BED COUNT (3 Ways)

```
                    ┌──────────────────────┐
                    │  BED COUNT UPDATE    │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
     ┌────────────────┐ ┌──────────────┐ ┌──────────────┐
     │  Hospital      │ │  Hospital    │ │  Admin       │
     │  Flutter App   │ │  Web         │ │  Sets        │
     │  +/- buttons   │ │  Dashboard   │ │  initial     │
     │                │ │  +/- buttons │ │  via         │
     │                │ │              │ │  /admin      │
     └───────┬────────┘ └──────┬───────┘ └──────┬───────┘
             │                 │                │
             └────────────┬────┴────────────────┘
                          │
                          ▼
              ┌──────────────────────────┐
              │  updateDoc(              │
              │    hospitals/{uid},      │
              │    { icuAvailable: N }   │
              │  )                       │
              └──────────────────────────┘
                          │
                          ▼
              ┌──────────────────────────┐
              │  Real-time stream        │
              │  triggers update on      │
              │  ALL clients listening   │
              │  (SOS page, admin, etc.) │
              └──────────────────────────┘
                          │
                          ▼
              ┌──────────────────────────┐
              │  Patient on /sos sees    │
              │  updated availability    │
              │  in real-time            │
              └──────────────────────────┘

FUTURE INTEGRATION (Phase 2):
   ┌──────────────────────────────┐
   │  Hospital HMS/Billing System │
   │  (e.g., Apollo's MedMantra)  │
   └─────────────┬────────────────┘
                 │
                 ▼ (webhook on admit/discharge)
   ┌──────────────────────────────┐
   │  Cloud Function endpoint     │
   │  /api/bed-update             │
   └─────────────┬────────────────┘
                 │
                 ▼
   ┌──────────────────────────────┐
   │  Update hospitals/{uid}      │
   │  bed counts automatically    │
   └──────────────────────────────┘
```

---

# 🔐 FLOW 13: SECURITY & ACCESS RULES

```
WEB ROUTES (React)
├─ /            → Public landing page
├─ /sos         → Public (no auth needed, anonymous Firestore write)
├─ /callback    → Public (no auth needed)
├─ /hospital    → Public login page
├─ /hospital/dashboard → Protected (requires hospital uid in hospitals collection)
├─ /admin       → Public login page
└─ /admin/dashboard → Protected (requires admins/{uid} doc)

FLUTTER ROUTES
├─ /splash      → Public
├─ /auth/login  → Public
├─ /auth/register → Public
├─ /driver/upload-docs → Public (during registration)
├─ /driver/sos/* → Public (allows driver during transition)
├─ /driver/*    → Requires Firebase Auth + drivers/{uid}
└─ /hospital/*  → Requires Firebase Auth + hospitals/{uid}

FIRESTORE SECURITY RULES (recommended — set in Firebase Console):
─────────────────────────────────────────────────────────────────
match /sos_requests/{id} {
  allow read: if true;       // public read for admins
  allow create: if true;     // anyone can create SOS
  allow update: if request.auth != null;  // only authed
}

match /callback_requests/{id} {
  allow read: if request.auth != null;    // admins only
  allow create: if true;                  // anyone can create
  allow update: if request.auth != null;
}

match /drivers/{uid} {
  allow read: if request.auth.uid == uid 
              || exists(/databases/$(database)/documents/admins/$(request.auth.uid));
  allow write: if request.auth.uid == uid;
}

match /hospitals/{uid} {
  allow read: if true;       // public for SOS page bed lookup
  allow write: if request.auth.uid == uid 
              || exists(/databases/$(database)/documents/admins/$(request.auth.uid));
}

match /rescue_requests/{id} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null;
}

match /admins/{uid} {
  allow read: if request.auth.uid == uid;
  allow write: if false;  // admin docs created manually in console
}
```

---

# ✅ COMPLETE FLOW SUMMARY (One-line per flow)

| # | Flow | Trigger | Actor | Result |
|---|------|---------|-------|--------|
| 1 | SOS Wizard | Patient visits /sos | Patient | sos_requests created, drivers notified |
| 2 | Callback Form | Patient visits /callback | Patient | callback_requests created, admin notified |
| 3 | WhatsApp | Patient messages WA number | Patient | Auto-reply with /sos link |
| 4 | Driver Register | New driver signs up | Driver | drivers/{uid} created, awaits verification |
| 5 | Driver Goes Online | Driver taps GO ONLINE | Driver | Listens for SOS + rescue requests of their type |
| 6A | Driver Accepts SOS | Tap Accept on SOS card | Driver | sos_request → assigned, navigates to patient |
| 6B | Driver Accepts Rescue | Tap Accept on popup | Driver | Goes through full pickup → hospital flow |
| 7A | Hospital Bed Mgmt | Tap +/- in app/web | Hospital | hospitals/{uid} bed count updated |
| 7B | Hospital Accepts | Tap Accept on incoming | Hospital | rescue_request status → hospital_assigned |
| 7C | Hospital Tracks | View track screen | Hospital | Live ambulance location |
| 8A | Admin Login | Visit /admin | Admin | Full dashboard access |
| 8B | Admin Verify | Approve/reject docs | Admin | Driver verification status updated |
| 8C | Admin Set Beds | Edit Beds modal | Admin | Hospital bed counts initialized |
| 8D | Admin Callback | Process callback | Admin | Convert to rescue_request, driver dispatched |

---

**End of Flowchart Document.**
This represents 100% of the user journeys and system flows in the Suraksha Kavach platform.
