import type {
  NextResponse,
} from "next/server";

export const SESSION_COOKIE_NAME =
  "comic_diary_session";

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  expires: Date;
  maxAge: number;
};

export function getSessionCookieOptions(
  expiresAt: Date,
  options: {
    production?: boolean;
    now?: Date;
  } = {},
): SessionCookieOptions {
  const production =
    options.production ??
    process.env.NODE_ENV ===
      "production";

  const now =
    options.now ??
    new Date();

  const remainingMs =
    expiresAt.getTime() -
    now.getTime();

  const maxAge =
    Math.max(
      0,
      Math.ceil(
        remainingMs / 1000,
      ),
    );

  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge,
  };
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
): void {
  response.cookies.set({
    name:
      SESSION_COOKIE_NAME,

    value:
      token,

    ...getSessionCookieOptions(
      expiresAt,
    ),
  });
}

export function clearSessionCookie(
  response: NextResponse,
): void {
  response.cookies.set({
    name:
      SESSION_COOKIE_NAME,

    value: "",

    httpOnly: true,

    secure:
      process.env.NODE_ENV ===
      "production",

    sameSite: "lax",

    path: "/",

    expires:
      new Date(0),

    maxAge: 0,
  });
}
