import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getAdminWorkspaceAccess } from "@/modules/admin-ui/admin-page-access";
import { Moderation } from "./Moderation";
export const dynamic = "force-dynamic";
export default async function CommunityModerationPage() {
  const access = await getAdminWorkspaceAccess();
  if (!access.currentUser) redirect("/login?next=%2Fadmin%2Fcommunity");
  if (!access.canViewAudit) return <div className="reader-page admin-page"><h1 className="reader-title">Доступ запрещён</h1><p>Требуется ADMIN_SECURITY.</p></div>;
  return <div className="reader-page admin-page"><h1 className="reader-title">Модерация комментариев</h1>
    <p className="mt-2 text-sm text-[var(--text-secondary)]">Жалобы, скрытие сообщений и временное ограничение публикаций. Личные дневники не затрагиваются.</p>
    <Moderation refreshToken={randomUUID()} />
  </div>;
}
