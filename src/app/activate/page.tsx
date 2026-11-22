import { ResendActivationForm } from "./ResendActivationForm";
import { publicRegistrationOperational } from "@/modules/auth/site-access-service";
import Link from "next/link";
import { ActivationForm } from "./ActivationForm";

export const dynamic = "force-dynamic";

export default async function ActivationPage() {
  // Presentation only. The POST endpoint independently enforces this opt-in.
  const enabled = process.env.REGISTRATION_ACTIVATION_REDEEM_ENABLED === "true";

  return (
    <main className="fantasy-auth-page mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10 sm:px-8">
      <div className="fantasy-auth-inner w-full">
        <p className="text-sm font-semibold text-[var(--primary)]">Comic Diary</p>
        <h1 className="mt-2 reader-title">Подтверждение почты</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
          Для завершения регистрации потребуется одноразовый код и новый пароль.
          Код вводится вручную — не вставляйте его в адресную строку.
        </p>
        <section className="fantasy-auth-card mt-8 rounded-2xl bg-[var(--surface)] p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold">Активация аккаунта</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {enabled
              ? "Введите код из письма. После активации войдите с новым паролем."
              : "Подтверждение пока недоступно: отправка писем не запущена, а приём кодов отключён."}
          </p>
          <ActivationForm enabled={enabled} />
          {await publicRegistrationOperational() ? <ResendActivationForm /> : null}
        </section>
        <div className="fantasy-auth-links mt-6 text-center text-sm text-[var(--muted)]">
          <Link href="/login" className="font-medium text-[var(--primary)] hover:underline">Вернуться ко входу</Link>
        </div>
      </div>
    </main>
  );
}
