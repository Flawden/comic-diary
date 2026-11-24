"""No external services or credentials required for BR02 smoke unit tests."""

import contextlib
import io
import http.server
import threading
import unittest

import smoke

SHA = "a" * 40
OTHER_SHA = "b" * 40


class FakeApp(http.server.BaseHTTPRequestHandler):
    commit = SHA
    database_ok = True
    fail_catalog = False
    catalog_body = (
        '<html lang="ru"><body><div class="reader-page catalog-page">'
        '<header><h1>Каталог произведений</h1></header>'
        '<section id="catalog" aria-label="Каталог комиксов"></section>'
        '</div></body></html>'
    ).encode("utf-8")
    redirect_login = False
    request_count = 0
    requests = []
    redirects = {}
    wait_status = 200
    wait_body = (
        '<main class="reader-panel"><h1>Закрытое бета-тестирование</h1>'
        '<form action="/beta-wait" method="get"><button>Проверить доступ</button></form>'
        '<a href="/login?next=%2F">Войти в аккаунт</a></main>'
    ).encode()

    def do_GET(self):
        type(self).request_count += 1
        route = self.path.split("?", 1)[0]
        type(self).requests.append(route)
        if route in self.redirects:
            status, locations = self.redirects[route]
            self.send_response(status)
            for location in locations:
                self.send_header("Location", location)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if route == "/api/health/ready":
            if not self.database_ok:
                return self.reply(503, b'{"status":"unavailable"}')
            return self.reply(200, ('{"status":"ready","commit":"' + self.commit + '"}').encode())
        if route == "/":
            return self.reply(500 if self.fail_catalog else 200, self.catalog_body)
        if route == "/login":
            if self.redirect_login:
                self.send_response(302)
                self.send_header("Location", "/")
                self.end_headers()
                return
            return self.reply(200, "Вход".encode())
        if route == "/beta-wait":
            return self.reply(self.wait_status, self.wait_body)
        return self.reply(404, b"not found")

    def reply(self, status, body):
        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@contextlib.contextmanager
def server():
    FakeApp.commit = SHA
    FakeApp.database_ok = True
    FakeApp.fail_catalog = False
    FakeApp.catalog_body = (
        '<html lang="ru"><body><div class="reader-page catalog-page">'
        '<header><h1>Каталог произведений</h1></header>'
        '<section id="catalog" aria-label="Каталог комиксов"></section>'
        '</div></body></html>'
    ).encode("utf-8")
    FakeApp.redirect_login = False
    FakeApp.request_count = 0
    FakeApp.requests = []
    FakeApp.redirects = {}
    FakeApp.wait_status = 200
    FakeApp.wait_body = (
        '<main class="reader-panel"><h1>Закрытое бета-тестирование</h1>'
        '<form action="/beta-wait" method="get"><button>Проверить доступ</button></form>'
        '<a href="/login?next=%2F">Войти в аккаунт</a></main>'
    ).encode()
    service = http.server.ThreadingHTTPServer(("127.0.0.1", 0), FakeApp)
    thread = threading.Thread(target=service.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{service.server_address[1]}"
    finally:
        service.shutdown()
        service.server_close()
        thread.join()


class SmokeTests(unittest.TestCase):
    def test_valid_readiness_version_and_pages(self):
        with server() as url:
            self.assertTrue(smoke.run(url, SHA, 1, 0, 2))
            self.assertEqual(FakeApp.request_count, 3)

    def test_closed_beta_relative_and_absolute_redirects(self):
        with server() as url:
            for location in ("/beta-wait", url + "/beta-wait"):
                with self.subTest(location=location):
                    FakeApp.requests = []
                    FakeApp.redirects = {"/": (307, [location])}
                    self.assertEqual(smoke.check_once(url, SHA, 2), "closed_beta")
                    self.assertEqual(FakeApp.requests, ["/api/health/ready", "/", "/beta-wait", "/login"])

    def test_log_distinguishes_public_catalog_from_restricted_catalog(self):
        with server() as url:
            for locations, mode, catalog in ((None, "catalog", "ok"), (["/beta-wait"], "closed_beta", "restricted")):
                with self.subTest(mode=mode):
                    FakeApp.redirects = {} if locations is None else {"/": (307, locations)}
                    output = io.StringIO()
                    with contextlib.redirect_stdout(output):
                        self.assertTrue(smoke.run(url, SHA, 1, 0, 2))
                    self.assertIn(f"LANDING={mode}; CATALOG={catalog}; LOGIN=ok", output.getvalue())

    def test_closed_beta_still_requires_exact_ready_sha(self):
        with server() as url:
            FakeApp.redirects = {"/": (307, ["/beta-wait"])}
            FakeApp.commit = OTHER_SHA
            self.assertFalse(smoke.run(url, SHA, 1, 0, 2))
            self.assertEqual(FakeApp.requests, ["/api/health/ready"])

    def test_readiness_redirect_is_never_allowed(self):
        with server() as url:
            FakeApp.redirects = {"/api/health/ready": (307, ["/beta-wait"])}
            self.assertFalse(smoke.run(url, SHA, 1, 0, 2))
            self.assertEqual(FakeApp.request_count, 1)

    def test_only_root_307_to_exact_beta_wait_is_allowed(self):
        with server() as url:
            bad_locations = [[], ["/login"], ["/beta-wait?next=/"], ["/beta-wait#x"],
                             ["//127.0.0.1/beta-wait"], ["https://evil.example/beta-wait"],
                             [url.replace("127.0.0.1", "localhost") + "/beta-wait"],
                             ["https://127.0.0.1/beta-wait"], [url + "/%62eta-wait"],
                             ["/%62eta-wait"], ["/beta-wait/"], ["/beta-wait", "/beta-wait"],
                             [url.replace("://", "://user:password@") + "/beta-wait"]]
            for locations in bad_locations:
                with self.subTest(locations=locations):
                    FakeApp.requests = []
                    FakeApp.redirects = {"/": (307, locations)}
                    self.assertFalse(smoke.run(url, SHA, 1, 0, 2))
                    self.assertEqual(FakeApp.requests, ["/api/health/ready", "/"])
            for status in (301, 302, 303, 308, 401, 403, 500, 503):
                with self.subTest(status=status):
                    FakeApp.redirects = {"/": (status, ["/beta-wait"])}
                    self.assertFalse(smoke.run(url, SHA, 1, 0, 2))

    def test_beta_wait_must_return_200_without_redirect_chain(self):
        with server() as url:
            for status in (307, 302, 503):
                with self.subTest(status=status):
                    FakeApp.requests = []
                    FakeApp.redirects = {"/": (307, ["/beta-wait"]), "/beta-wait": (status, ["/"])}
                    self.assertFalse(smoke.run(url, SHA, 1, 0, 2))
                    self.assertEqual(FakeApp.requests, ["/api/health/ready", "/", "/beta-wait"])

    def test_closed_beta_rejects_error_or_incomplete_waiting_documents(self):
        with server() as url:
            original = FakeApp.wait_body
            for body in (b"error", b"\xff", b"x" * (smoke.MAX_BODY + 1),
                         original.replace(b'<main class="reader-panel">', b'<div>'),
                         original.replace("Закрытое бета-тестирование".encode(), b"error"),
                         original.replace(b'action="/beta-wait"', b'action="/other"'),
                         original.replace(b'method="get"', b'method="post"'),
                         original.replace(b'href="/login?next=%2F"', b'href="https://evil.example/login"'),
                         b'<script>' + original + b'</script>'):
                with self.subTest(body=body[:30]):
                    FakeApp.redirects = {"/": (307, ["/beta-wait"])}
                    FakeApp.wait_body = body
                    self.assertFalse(smoke.run(url, SHA, 1, 0, 2))

    def test_waiting_page_cannot_replace_public_catalog_without_redirect(self):
        with server() as url:
            FakeApp.catalog_body = FakeApp.wait_body
            self.assertFalse(smoke.run(url, SHA, 1, 0, 2))

    def test_closed_beta_still_checks_login_without_redirects(self):
        with server() as url:
            FakeApp.redirects = {"/": (307, ["/beta-wait"])}
            FakeApp.redirect_login = True
            self.assertFalse(smoke.run(url, SHA, 1, 0, 2))

    def test_wrong_deployed_revision_is_rejected(self):
        with server() as url:
            FakeApp.commit = OTHER_SHA
            self.assertFalse(smoke.run(url, SHA, 1, 0, 2))

    def test_unavailable_database_is_rejected(self):
        with server() as url:
            FakeApp.database_ok = False
            self.assertFalse(smoke.run(url, SHA, 1, 0, 2))

    def test_broken_catalog_is_rejected(self):
        with server() as url:
            FakeApp.fail_catalog = True
            self.assertFalse(smoke.run(url, SHA, 1, 0, 2))

    def test_new_editorial_copy_does_not_break_catalog(self):
        with server() as url:
            FakeApp.catalog_body = FakeApp.catalog_body.replace(
                "Каталог произведений".encode(), "Добро пожаловать в Чайную".encode()
            )
            self.assertTrue(smoke.run(url, SHA, 1, 0, 2))

    def test_old_headline_alone_does_not_count_as_catalog(self):
        with server() as url:
            FakeApp.catalog_body = b"<html><body>" + "Найдите свою историю".encode() + b"</body></html>"
            self.assertFalse(smoke.run(url, SHA, 1, 0, 2))

    def test_missing_catalog_shelf_is_rejected(self):
        with server() as url:
            FakeApp.catalog_body = FakeApp.catalog_body.replace(b'id="catalog"', b'id="missing"')
            self.assertFalse(smoke.run(url, SHA, 1, 0, 2))

    def test_missing_catalog_page_container_is_rejected(self):
        with server() as url:
            FakeApp.catalog_body = FakeApp.catalog_body.replace(b"catalog-page", b"other-page")
            self.assertFalse(smoke.run(url, SHA, 1, 0, 2))

    def test_redirect_does_not_count_as_login_page(self):
        with server() as url:
            FakeApp.redirect_login = True
            self.assertFalse(smoke.run(url, SHA, 1, 0, 2))

    def test_network_failure_is_reported(self):
        self.assertFalse(smoke.run("http://127.0.0.1:1", SHA, 1, 0, 0.3))

    def test_production_requires_https_and_no_credentials(self):
        for bad in ("http://example.org", "https://alice:secret@example.org", "https://example.org/path", "https://example.org?x=1"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                smoke.validate_origin(bad)

    def test_reject_invalid_sha_before_network(self):
        with self.assertRaises(ValueError):
            smoke.run("https://example.org", "a1", 1, 0, 1)

    def test_retries_transient_unavailable_readiness(self):
        with server() as url:
            original = smoke.check_once
            calls = []
            def flaky(*args):
                calls.append(1)
                if len(calls) == 1:
                    raise smoke.SmokeFailure("temporarily unavailable")
                return original(*args)
            smoke.check_once = flaky
            try:
                self.assertTrue(smoke.run(url, SHA, 2, 0, 2))
                self.assertEqual(len(calls), 2)
            finally:
                smoke.check_once = original


if __name__ == "__main__":
    unittest.main()
