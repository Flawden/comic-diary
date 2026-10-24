# Смотритель чайной: Telegram backup notifications

The keeper is separate from the web app and the existing backup service. Installing
source in Git does not activate a server timer. It does not restart the app/DB or
change the existing backup schedule/retention.

## Install

Copy the six files in `deploy/keeper` to a private directory on the VPS and run
`sudo bash install.sh` there. The installer runs local tests, saves existing managed
program/units, validates systemd units, pairs Telegram, starts the monitor once and
only then enables its timer. It refuses linked paths/unmanaged units. A failed new
installation does not enable the timer. On failed reinstall a previously active
monitor timer restart is requested; inspect the service journal.

The program uses Python 3 standard library only. Root reads existing root-only backup
metadata. Unit hardening makes the filesystem read-only except the private monitor
state directory. Monitoring does not need a database password or Telegram webhook.

## Private pairing

Enter the BotFather token at the hidden terminal prompt on the VPS. It is not passed
as a command argument, stored in the repository, shell history or application .env.
The setup checks getMe and refuses a bot already using a webhook. It prints a fresh
`/start CODE` challenge. Send exactly that message to the bot from your private chat
within three minutes. Only a private message whose sender equals the chat owner is
accepted; ambiguous matching chats fail. Existing unrelated updates cannot select a
recipient. No separate recipient lookup bot or shared screenshot of credentials is
needed. Pairing sends a setup message before saving root-only configuration.

Token/chat config: `/etc/comic-diary/telegram.json`, root-owned, mode 0600.
Notification state: `/var/lib/comic-diary-keeper/state.json`, private directory.
If config already exists, installer preserves pairing. Explicit re-pairing:
`sudo python3 /usr/local/lib/comic-diary/keeper/configure.py --reconfigure`.
No Telegram secret is printed on network/API errors.

## Behavior

Every 15 minutes (up to one minute timer accuracy):
- confirm backup timer enabled and active;
- read last-success/last-attempt metadata and completion marker;
- check referenced dump/archive/manifest exist and are nonempty;
- reject future/older-than-36h timestamps and failed last attempt.

This is lightweight health monitoring. It does not reread entire archive contents;
the backup producer validates hashes/roundtrip and separate restore drills establish
recovery. The keeper cannot turn missing or corrupt metadata into a healthy result.

It sends one message per newly observed successful copy, an error on changed fault
state, a reminder at most every six hours for the same fault, and one recovery message.
The first service start may send current healthy-copy status after the pairing test.
No private diary text, credentials or archives are sent to Telegram. A failed send
does not advance saved notification state: the next run retries. HTTP requests have
bounded timeouts; failed delivery is reflected as failed service execution.

## Inspect / pause

```bash
sudo systemctl list-timers --all comic-diary-keeper.timer --no-pager
sudo journalctl -u comic-diary-keeper.service -n 30 --no-pager
sudo python3 /usr/local/lib/comic-diary/keeper/keeper.py --check
sudo systemctl disable --now comic-diary-keeper.timer
```

`--check` sends nothing. Pausing keeper does not pause backups. A complete VPS outage,
broken outbound network or blocked Telegram cannot be reported by that host while
it is unavailable; external uptime/dead-man monitoring is separate work. Successful
Telegram delivery and later scheduled monitoring need real server/operator evidence.
Off-host copies to Windows remain separate work and must not be claimed from alerts.

API references: https://core.telegram.org/bots/api#sendmessage and
https://core.telegram.org/bots/api#getupdates .


## Initial Windows/install recovery — 2026-10-24

The first Windows package applied all ten files but stopped before commit because
its combined stdout/stderr Git reader treated an LF/CRLF warning as a filename.
Recovery validates the exact previous/applied contents and reads Git filenames from
stdout with stderr captured separately. No line-ending conversion or rollback is
required. A dirty working tree is accepted only for these package paths and hashes.

The first server setup passed all ten existing tests but failed before the token
prompt: Python open('/dev/tty','r+') attempts buffered random access on a nonseekable
terminal. Setup now calls getpass directly, refuses noninteractive input/echo fallback
and reports a safe stage label on failure. Two regressions cover no-TTY refusal and
real controlling-PTY input with no secret echo. Re-run the installer after copying
updated configure.py and test_keeper.py; no token was entered/saved by the failed
initial run. Actual Telegram pairing/delivery and enabled timer remain pending.
