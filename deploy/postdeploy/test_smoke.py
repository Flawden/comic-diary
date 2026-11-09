"""No external services or credentials required for BR02 smoke unit tests."""

import contextlib
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

    def do_GET(self):
        type(self).request_count += 1
        route = self.path.split("?", 1)[0]
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
