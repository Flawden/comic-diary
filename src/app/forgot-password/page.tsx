import Link from "next/link";
import { isRecoveryRequestOperational } from "@/modules/auth/password-reset-request-config";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  const enabled = isRecoveryRequestOperational(process.env);
  return (
    <main className="fantasy-auth-page mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10 sm:px-8">
      <div className="fantasy-auth-inner w-full">
        <p className="text-sm font-semibold text-[var(--primary)]">Comic Diary</p>
        <h1 className="mt-2 reader-title">Забыли пароль?</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
          Запросите одноразовый код, чтобы установить новый пароль.
        </p>
        <section className="fantasy-auth-card mt-8 rounded-2xl bg-[var(--surface)] p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold">Восстановление доступа</h2>
          {enabled ? <ForgotPasswordForm /> : <>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Отправка кодов сброса пароля пока не подключена. Мы не просим здесь email,
            потому что отправить письмо ещё нельзя.
          </p>
          </>}
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Если у вас уже есть действующий код восстановления, можно открыть
            страницу установки нового пароля. Приём кодов также может быть временно отключён.
          </p>
          <div className="mt-5">
            <Link href="/reset-password" className="font-semibold text-[var(--primary)] hover:underline">
              У меня уже есть код
            </Link>
          </div>
        </section>
        <div className="fantasy-auth-links mt-6 text-center text-sm text-[var(--muted)]">
          <Link href="/login" className="font-medium text-[var(--primary)] hover:underline">Вернуться ко входу</Link>
        </div>
      </div>
    </main>
  );
}
