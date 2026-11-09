#!/usr/bin/env python3
"""BR02: read-only public smoke check for the exact deployed Comic Diary release."""

import argparse
from html.parser import HTMLParser
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
MAX_BODY = 1_000_000


class SmokeFailure(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def validate_origin(origin: str) -> str:
    parsed = urllib.parse.urlsplit(origin)
    if (
        not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Expected a public HTTPS origin with no path, query, or credentials")
    if parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost"):
        return origin.rstrip("/")
    if parsed.scheme != "https":
        raise ValueError("BR02 requires HTTPS for public production")
    return origin.rstrip("/")


def fetch(origin: str, path: str, timeout: float = 8.0) -> bytes:
    url = origin + path
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ComicDiary-BR02/1.0",
            "Accept-Encoding": "identity",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request, timeout=timeout) as response:
            if response.status != 200:
                raise SmokeFailure(f"{path.split('?')[0]} returned HTTP {response.status}")
            if urllib.parse.urlsplit(response.url).netloc != urllib.parse.urlsplit(origin).netloc:
                raise SmokeFailure("Response was served by a different host")
            body = response.read(MAX_BODY + 1)
            if len(body) > MAX_BODY:
                raise SmokeFailure(f"{path.split('?')[0]} response is too large")
            return body
    except urllib.error.HTTPError as exc:
        raise SmokeFailure(f"{path.split('?')[0]} returned HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        # Do not print response bodies, database diagnostics, cookies, or credentials.
        raise SmokeFailure(f"{path.split('?')[0]} network error ({type(exc).__name__})") from exc


class CatalogDocument(HTMLParser):
    """Verify catalog landmarks, not presentation copy that changes with redesigns."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.has_catalog_page = False
        self.has_catalog_shelf = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "div" and "catalog-page" in (attributes.get("class") or "").split():
            self.has_catalog_page = True
        if tag == "section" and attributes.get("id") == "catalog":
            self.has_catalog_shelf = True


def check_catalog(body: bytes) -> None:
    try:
        html = body.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise SmokeFailure("/ did not return UTF-8 HTML") from exc
    parser = CatalogDocument()
    parser.feed(html)
    parser.close()
    if not parser.has_catalog_page or not parser.has_catalog_shelf:
        raise SmokeFailure("/ did not render its catalog container and shelf")


def check_once(origin: str, expected_sha: str, timeout: float = 8.0) -> None:
    try:
        response = json.loads(fetch(origin, f"/api/health/ready?br02={expected_sha}", timeout))
    except (ValueError, UnicodeDecodeError) as exc:
        raise SmokeFailure("Readiness response is not valid JSON") from exc
    if not isinstance(response, dict) or response.get("status") != "ready":
        raise SmokeFailure("Readiness did not confirm database availability")
    if response.get("commit") != expected_sha:
        raise SmokeFailure("Public site is serving a different commit")

    check_catalog(fetch(origin, "/", timeout))
    if "Вход".encode("utf-8") not in fetch(origin, "/login", timeout):
        raise SmokeFailure("/login did not render its expected page")


def run(origin: str, expected_sha: str, attempts: int, delay: float, timeout: float) -> bool:
    origin = validate_origin(origin)
    if not SHA_PATTERN.fullmatch(expected_sha):
        raise ValueError("Expected a full lowercase 40-character Git commit SHA")
    if attempts < 1 or attempts > 30 or delay < 0 or timeout <= 0:
        raise ValueError("Invalid retry or timeout settings")
    for attempt in range(1, attempts + 1):
        try:
            check_once(origin, expected_sha, timeout)
            print(f"BR02=PASS; COMMIT={expected_sha}; READINESS=ok; CATALOG=ok; LOGIN=ok", flush=True)
            return True
        except SmokeFailure as exc:
            print(f"BR02=RETRY; ATTEMPT={attempt}/{attempts}; REASON={exc}", flush=True)
            if attempt < attempts:
                time.sleep(delay)
    print("BR02=FAIL; production did not pass the post-deploy smoke checks", flush=True)
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="Public HTTPS origin")
    parser.add_argument("--expected-sha", required=True, help="Exact deployed Git commit")
    parser.add_argument("--attempts", type=int, default=18)
    parser.add_argument("--delay-seconds", type=float, default=6)
    parser.add_argument("--timeout-seconds", type=float, default=8)
    args = parser.parse_args()
    try:
        return 0 if run(args.url, args.expected_sha, args.attempts, args.delay_seconds, args.timeout_seconds) else 1
    except ValueError as exc:
        print(f"BR02=CONFIG_ERROR; {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
