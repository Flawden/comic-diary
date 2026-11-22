import {SiteAccessSettings} from './SiteAccessSettings';
import {readSiteAccess} from '@/modules/auth/site-access-service';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAdminWorkspaceAccess } from '@/modules/admin-ui/admin-page-access';
import { InvitationManager } from './InvitationManager';
export const dynamic = 'force-dynamic';
export default async function InvitationsPage() {
  const access = await getAdminWorkspaceAccess();
  if (!access.currentUser) redirect('/login?next=%2Fadmin%2Finvitations');
  if (access.currentUser.role !== 'ADMIN' || !access.canAdminUsers)
    return (
      <div className="reader-page admin-page">
        <h1 className="reader-title">Доступ запрещён</h1>
        <p>Приглашения доступны только администраторам.</p>
      </div>
    );
  return (
    <div className="reader-page admin-page">
      <p className="text-sm text-[var(--text-secondary)]">Закрытая бета</p>
      <h1 className="reader-title">Приглашения</h1>
      <p className="my-4">
        Персональная ссылка действует 7 дней. Аккаунт создаёт сам получатель и
        обязательно подтверждает почту. Режим публичной регистрации управляется ниже.
      </p>
      <Link className="tea-text-action" href="/admin/users">
        Пользователи и роли →
      </Link>
      <SiteAccessSettings initial={await readSiteAccess()}/>
      <InvitationManager />
    </div>
  );
}
