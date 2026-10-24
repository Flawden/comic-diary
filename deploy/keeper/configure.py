#!/usr/bin/env python3
"""Pair the keeper with a private Telegram chat using a one-time code."""
import getpass
import os
from pathlib import Path
import secrets
import sys
import time
import warnings
from keeper import CONFIG, MANAGED, read_json, send, telegram, write_json

STAGE = "preflight"


def match_chat(updates, code):
    matches = set()
    for update in updates:
        message = update.get('message', {})
        chat = message.get('chat', {})
        sender = message.get('from', {})
        if (chat.get('type') == 'private' and isinstance(chat.get('id'), int) and chat['id'] > 0
                and sender.get('id') == chat['id'] and not sender.get('is_bot', True)
                and message.get('text', '').strip() == '/start '+code):
            matches.add(chat['id'])
    if len(matches) > 1:
        raise ValueError('Ambiguous pairing')
    return next(iter(matches), None)


def read_token():
    if not sys.stdin.isatty():
        raise ValueError('Interactive SSH terminal required')
    with warnings.catch_warnings():
        # Refuse a fallback that could echo the secret if terminal echo control fails.
        warnings.simplefilter('error', getpass.GetPassWarning)
        return getpass.getpass('Токен от BotFather (ввод скрыт): ').strip()


def main():
    global STAGE
    if os.geteuid() != 0:
        raise ValueError('Root required')
    if CONFIG.parent.is_symlink() or CONFIG.is_symlink():
        raise ValueError('Linked configuration')
    if CONFIG.exists():
        old = read_json(CONFIG, private=True)
        if old.get('managedBy') != MANAGED:
            raise ValueError('Unmanaged configuration')
        print('CONFIG=EXISTS; сохранён прежний чат. Для перепривязки используйте --reconfigure.')
        if '--reconfigure' not in sys.argv:
            return
    STAGE = "token_input"
    token = read_token()
    STAGE = "bot_auth"
    bot = telegram(token, 'getMe', {})
    if not bot.get('is_bot'):
        raise ValueError('Not a bot')
    STAGE = "webhook_check"
    if telegram(token, 'getWebhookInfo', {}).get('url'):
        raise ValueError('Bot already uses a webhook; use a dedicated notification bot')
    STAGE = "pairing_wait"
    code = secrets.token_urlsafe(9)
    print('Отправьте боту @'+bot['username']+' ровно эту строку:')
    print('/start '+code, flush=True)
    deadline, offset = time.monotonic()+180, 0
    chat = None
    while time.monotonic() < deadline:
        updates = telegram(token, 'getUpdates', {'offset': offset, 'limit': 100, 'timeout': 15, 'allowed_updates': ['message']})
        chat = match_chat(updates, code)
        if chat is not None:
            break
        if updates:
            offset = max(item['update_id'] for item in updates)+1
    if chat is None:
        raise ValueError('Pairing timed out; rerun and use the new code')
    config = {'managedBy': MANAGED, 'token': token, 'chatId': chat}
    # This explicitly requested setup message confirms the paired destination.
    STAGE = "test_delivery"
    send(config, '☕ Смотритель чайной на связи. Здесь будут уведомления о копиях Comic Diary, ошибках и восстановлении работы.')
    STAGE = "config_write"
    CONFIG.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    write_json(CONFIG, config)
    print('TELEGRAM_PAIRING=PASS; тестовое сообщение отправлено, токен сохранён только на VPS')


if __name__ == '__main__':
    os.umask(0o077)
    try:
        main()
    except Exception:
        print('TELEGRAM_PAIRING_STAGE='+STAGE, file=sys.stderr)
        print('TELEGRAM_PAIRING=FAIL; проверьте токен, соединение, отсутствие webhook и одноразовый код. Секреты в лог не выведены.', file=sys.stderr)
        sys.exit(1)
