import Link from "next/link";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  // UI state does not replace the POST endpoint's independent fail-closed check.
  const enabled = process.env.PASSWORD_RESET_REDEEM_ENABLED === "true";

  return (
    <main className="fantasy-auth-page mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10 sm:px-8">
      <div className="fantasy-auth-inner w-full">
        <p className="text-sm font-semibold text-[var(--primary)]">Comic Diary</p>
        <h1 className="mt-2 reader-title">Новый пароль</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
          Код восстановления вводится вручную. Не добавляйте его в адрес страницы.
        </p>
        <section className="fantasy-auth-card mt-8 rounded-2xl bg-[var(--surface)] p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold">Смена пароля по коду</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {enabled
              ? "Введите код из письма и придумайте новый пароль. Код действует 20 минут и используется один раз."
              : "Приём кодов восстановления сейчас отключён, а отправка писем ещё не подключена."}
          </p>
          <ResetPasswordForm enabled={enabled} />
        </section>
        <div className="fantasy-auth-links mt-6 text-center text-sm text-[var(--muted)]">
          <Link href="/forgot-password" className="mr-4 font-medium text-[var(--primary)] hover:underline">Запросить новый код</Link>
          <Link href="/login" className="font-medium text-[var(--primary)] hover:underline">Вернуться ко входу</Link>
        </div>
      </div>
    </main>
  );
}
