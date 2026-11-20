# Security Specification & Payload-First TDD — TerraCarga MVP

## 1. Data Invariants
1. **Default-Deny Baseline:** Any path not explicitly matched is denied (`allow read, write: if false`).
2. **PII Isolation:** User email, phone, and tax ID live strictly in `/users/{userId}/private/{docId}`, readable and writable only by `userId` or a verified admin. `/users/{userId}` contains no PII.
3. **No Self-Assigned Admin Escalation:** A standard user creating or updating `/users/{userId}` may only set `role` to `'shipper'` or `'carrier'`; `'admin'` requires verified bootstrap admin identity (`pensando@fueradelacaja.co`) or `/admins/{uid}` document.
4. **Master Gate Subcollections:**
   - `/vehicles/{vehicleId}/maintenance/{recordId}` validates parent `/vehicles/{vehicleId}` exists and `ownerId == request.auth.uid` (or admin).
   - `/shipments/{shipmentId}/events/{eventId}` validates parent `/shipments/{shipmentId}` exists and caller is `shipperId`, `carrierId`, or admin.
5. **Action-Based Shipment State Machine:**
   - Shippers cannot overwrite `carrierId` once assigned; Carriers can only transition `status` `'disponible' -> 'asignado'` (setting `carrierId == request.auth.uid`) or `'asignado' -> 'en_transito' -> 'entregado'`.
   - Terminal lock: Once `status == 'entregado'`, `settlementStatus == 'liquidado_externo'`, and `offsetCompleted == true`, updates are blocked for non-admins.
6. **Atomic Carbon Certification:** Marking a shipment `offsetCompleted: true` requires `existsAfter(/databases/$(database)/documents/certificates/$(incoming().certificateId))`.
7. **Strict Query Enforcement:** All `allow list` rules evaluate `resource.data` directly without `get()` or `exists()` lookups.
8. **Temporal Integrity & Size Bounds:** Every `create` validates `createdAt == request.time`, every `update` preserves `createdAt == existing().createdAt` and sets `updatedAt == request.time`, and every string enforces `.size()` limits.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return `PERMISSION_DENIED`)
1. **Unauthenticated Read/Write:** Anonymous request reading `/vehicles` or creating `/shipments/ship_x`.
2. **Self-Assigned Admin Escalation:** User `uid_a` writes `/users/uid_a` with `role: 'admin'`.
3. **Unverified Email Spoofing:** Authenticated user with `email_verified: false` (even matching admin email) tries to write `/shipments/ship_1`.
4. **PII Cross-User Read:** Authenticated user `uid_b` calls `get` on `/users/uid_a/private/profile`.
5. **Shadow / Ghost Field Injection:** Authenticated user sends `{ ..., isVerified: true }` on `/vehicles/veh_1`.
6. **Path ID Poisoning:** Authenticated user attempts to create `/shipments/bad$id..with..chars!`.
7. **Oversized String DoW Attack:** Authenticated user sends a 5,000-char `title` on `/shipments/ship_1`.
8. **Orphan Maintenance Record:** User creates `/vehicles/nonexistent_veh/maintenance/mnt_1`.
9. **Unauthorized Fleet Hijack:** User `uid_b` creates `/vehicles/veh_2` with `ownerId: 'uid_a'`.
10. **Blanket List Scraping:** User `uid_b` attempts to `list` `/notifications` belonging to `uid_a`.
11. **Terminal State Tampering:** Shipper attempts to mutate `priceUsd` on a shipment whose `status == 'entregado'`, `settlementStatus == 'liquidado_externo'`, and `offsetCompleted == true`.
12. **Client Timestamp Forgery:** User creates `/supportTickets/t_1` with backdated `createdAt` instead of `request.time`.
