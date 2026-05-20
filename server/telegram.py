"""Integração com a Bot API do Telegram (Fase 12).

Notificações enviadas para o grupo vinculado a cada static:
- Evento de raid criado
- Lembrete 24 h antes
- Lembrete no dia

Tudo é melhor-esforço: se o token não estiver configurado ou a requisição
falhar, a função retorna False silenciosamente e o app continua normalmente.
"""
import os
import hashlib
import logging
import requests

log = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org/bot{token}/{method}"
SITE_URL = os.environ.get("SITE_URL", "https://mhigos-raid-planner.up.railway.app")
REQUEST_TIMEOUT = 5  # segundos

# Dia da semana em pt-BR para mensagens
_WEEKDAYS_PT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


def get_bot_token():
    """Retorna o token do bot ou None se não configurado."""
    return os.environ.get("TELEGRAM_BOT_TOKEN")


def get_webhook_secret():
    """Token usado no header X-Telegram-Bot-Api-Secret-Token.

    Configurado uma vez via setWebhook e validado a cada update.
    Se TELEGRAM_WEBHOOK_SECRET não estiver setado, deriva determinísticamente
    do SECRET_KEY (sha256 hex — sempre alfanumérico, válido para o Telegram).
    """
    explicit = os.environ.get("TELEGRAM_WEBHOOK_SECRET")
    if explicit:
        return explicit
    secret_key = os.environ.get("SECRET_KEY") or "dev-only-key-change-me-in-prod"
    return hashlib.sha256(("tg-webhook:" + secret_key).encode("utf-8")).hexdigest()


def is_configured():
    return bool(get_bot_token())


def _call(method, payload):
    """Chama um método da Bot API. Retorna o JSON da resposta ou None."""
    token = get_bot_token()
    if not token:
        log.debug("telegram: token não configurado, ignorando %s", method)
        return None
    url = TELEGRAM_API_BASE.format(token=token, method=method)
    try:
        resp = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
        data = resp.json()
        if not data.get("ok"):
            log.warning("telegram %s falhou: %s", method, data)
        return data
    except Exception as e:
        log.warning("telegram %s erro: %s", method, e)
        return None


def send_group_message(chat_id, text):
    """Envia uma mensagem para o grupo. Retorna True se ok, False caso contrário."""
    if not chat_id:
        return False
    data = _call("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    })
    return bool(data and data.get("ok"))


# ---------- Formatadores de mensagem ----------

def _format_date(date_str):
    """Converte 'YYYY-MM-DD' em 'qua, 22/05'. Aceita string vazia."""
    if not date_str or len(date_str) < 10:
        return date_str or ""
    try:
        from datetime import date
        y, m, d = int(date_str[0:4]), int(date_str[5:7]), int(date_str[8:10])
        dt = date(y, m, d)
        return f"{_WEEKDAYS_PT[dt.weekday()]}, {d:02d}/{m:02d}"
    except (ValueError, IndexError):
        return date_str


def format_event_created(prog_name, date_str, confirmed, quorum, dynamic=False):
    pretty_date = _format_date(date_str)
    if dynamic:
        body = f"📅 <b>Raid agendada!</b>\n{prog_name} — {pretty_date}.\n\nAcesse {SITE_URL} e marque se vai ou não."
    else:
        body = (
            f"📅 <b>Raid agendada!</b>\n"
            f"{prog_name} — {pretty_date}.\n\n"
            f"Confirmados: {confirmed}/{quorum}.\n"
            f"Acesse {SITE_URL} e marque se vai ou não."
        )
    return body


def format_event_postponed(prog_name, old_date_str, new_date_str):
    old_pretty = _format_date(old_date_str)
    new_pretty = _format_date(new_date_str)
    return (
        f"📅 <b>Raid adiada</b>\n"
        f"{prog_name} foi adiada de {old_pretty} para {new_pretty}.\n\n"
        f"Confirme sua presença em {SITE_URL}."
    )


def format_event_cancelled(prog_name, date_str):
    pretty_date = _format_date(date_str)
    return (
        f"❌ <b>Raid cancelada</b>\n"
        f"{prog_name} — {pretty_date}."
    )


def format_event_cancelled_bulk(count):
    return (
        f"❌ <b>{count} raids canceladas</b>\n"
        f"Confira a agenda em {SITE_URL}."
    )


def format_reminder_24h(prog_name, date_str, confirmed, quorum, dynamic=False):
    pretty_date = _format_date(date_str)
    if dynamic:
        return (
            f"⏰ <b>Lembrete</b>\n"
            f"{prog_name} é amanhã ({pretty_date}).\n\n"
            f"Confirmados: {confirmed}.\n"
            f"Ainda não marcou? {SITE_URL}"
        )
    return (
        f"⏰ <b>Lembrete</b>\n"
        f"{prog_name} é amanhã ({pretty_date}).\n\n"
        f"Confirmados: {confirmed}/{quorum}.\n"
        f"Ainda não marcou? {SITE_URL}"
    )


def format_reminder_today(prog_name, date_str, confirmed, quorum, dynamic=False):
    pretty_date = _format_date(date_str)
    if dynamic:
        return (
            f"⚔️ <b>É hoje!</b>\n"
            f"{prog_name} — {pretty_date}.\n\n"
            f"Confirmados: {confirmed}.\nBoa raid!"
        )
    return (
        f"⚔️ <b>É hoje!</b>\n"
        f"{prog_name} — {pretty_date}.\n\n"
        f"Confirmados: {confirmed}/{quorum}.\nBoa raid!"
    )
