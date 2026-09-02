export type AdminImportAvailability =
  | "disabled"
  | "ready";

export function getAdminImportAvailability():
  AdminImportAvailability {
  return (
    process.env.ADMIN_IMPORT_ENABLED ===
    "true"
      ? "ready"
      : "disabled"
  );
}
