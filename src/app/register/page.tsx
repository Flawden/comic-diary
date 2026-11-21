import Link from 'next/link';
import {BetaRegistration} from './BetaRegistration';
import {betaRegistrationOperational} from '@/modules/auth/beta-invitation-service';
import {INVITATION_MESSAGE} from '@/modules/auth/beta-invitation-policy';
export const dynamic='force-dynamic';
export const metadata={referrer:'no-referrer' as const};
export default function RegisterPage(){return <main className="fantasy-auth-page mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10 sm:px-8"><div className="fantasy-auth-inner w-full"><p className="text-sm font-semibold text-[var(--primary)]">Comic Diary</p><h1 className="mt-2 reader-title">Регистрация</h1><section className="fantasy-auth-card mt-8 rounded-2xl bg-[var(--surface)] p-6 sm:p-8"><h2 className="text-lg font-semibold">Закрытое бета-тестирование</h2><p className="mt-3 leading-6">{INVITATION_MESSAGE}.</p><BetaRegistration enabled={betaRegistrationOperational(process.env)}/></section><nav className="fantasy-auth-links mt-6 flex flex-wrap justify-center gap-4 text-sm"><Link href="/login">Уже есть аккаунт? Войти</Link><Link href="/forgot-password">Восстановить пароль</Link><Link href="/">Вернуться в каталог</Link></nav></div></main>;}
