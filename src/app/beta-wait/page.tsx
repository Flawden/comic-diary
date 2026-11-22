import Link from "next/link";
import { BETA_WAIT_MESSAGE } from "@/modules/auth/site-access-policy";
import { LogoutButton } from "../account/LogoutButton";
export const dynamic = "force-dynamic";
export default function BetaWait() {
  return (
    <main className="reader-panel mx-auto my-12 max-w-xl p-6">
      <h1 className="reader-title">Закрытое бета-тестирование</h1>
      <p className="my-6">{BETA_WAIT_MESSAGE}</p>
      <Link href="/login">Войти в другой аккаунт</Link>
      <LogoutButton />
    </main>
  );
}
