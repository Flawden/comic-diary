# R7.5 — Users & Roles

R7.5 closes account administration by adding account entitlements as a concept
separate from authorization roles.

Already present before this stage:

- ADMIN-only user listing;
- account role and active-state inspection;
- USER / EDITOR / ADMIN role management;
- activation/deactivation;
- session revocation after authority/state changes;
- last-active-ADMIN protection;
- EDITOR denial at the ADMIN_USERS boundary.

This stage adds:

- `account_entitlement` enum with `PRIVATE_CATALOG`;
- normalized `user_entitlements` storage keyed by user + entitlement;
- ADMIN-only entitlement read/mutation through the existing user administration surface;
- session revocation when an entitlement changes.

`PRIVATE_CATALOG` is deliberately **not** added to `user_role` or the role
permission matrix. Roles continue to represent authority over shared/system
data. Entitlements represent optional account/product capabilities.

R8.2 private-personal-catalog behavior is not implemented here. R7.5 only
creates and administers the account capability that R8.2 may consume later.
