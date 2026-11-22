import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAppearance } from "@/db/schema";
import { getCurrentUser } from "@/modules/auth/request-identity";
import { readSiteAccess } from "@/modules/auth/site-access-service";
import {
  BETA_WAIT_MESSAGE,
  canEnterBeta,
} from "@/modules/auth/site-access-policy";
import { LogoutButton } from "../account/LogoutButton";
export const dynamic = "force-dynamic";
export default async function BetaWait() {
  const policy = await readSiteAccess();
  if (!policy.betaOnly) redirect("/");
  const user = await getCurrentUser();
  const [appearance] = user
    ? await db
        .select({ participant: userAppearance.betaParticipant })
        .from(userAppearance)
        .where(eq(userAppearance.userId, user.id))
    : [];
  if (
    canEnterBeta(
      policy.betaOnly,
      user?.role ?? null,
      appearance?.participant === true,
    )
  )
    redirect("/");
  return (
    <main className="reader-panel mx-auto my-12 max-w-xl p-6">
      <h1 className="reader-title">Закрытое бета-тестирование</h1>
      {user ? (
        <>
          <p className="my-6">{BETA_WAIT_MESSAGE}</p>
          <p className="my-4 break-words">
            Вы вошли как <strong>{user.email}</strong>. У этого аккаунта пока
            нет отметки участника беты.
          </p>
        </>
      ) : (
        <p className="my-6">
          Доступ пока открыт только участникам закрытого бета-тестирования.
          Войдите в аккаунт, которому администратор выдал участие в бете.
        </p>
      )}
      <form action="/beta-wait" method="get" className="my-5">
        <button className="tea-outline" type="submit">
          Проверить доступ
        </button>
        <p className="mt-2 text-sm">
          Если администратор уже выдал доступ, проверьте его снова. Повторно
          регистрироваться не нужно.
        </p>
      </form>
      <Link href="/login?next=%2F" prefetch={false}>
        {user ? "Войти в другой аккаунт" : "Войти в аккаунт"}
      </Link>
      {user && <LogoutButton />}
      {user && <p className="mt-5"><Link href="/account/delete">Удалить мой аккаунт</Link></p>}
    </main>
  );
}
