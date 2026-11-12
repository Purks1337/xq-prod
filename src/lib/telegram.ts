/**
 * Telegram Bot notification helper
 * Supports loading credentials from process.env / .env
 */

export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

export async function sendTelegramMessage(htmlMessage: string): Promise<TelegramSendResult> {
  // Ensure local .env is loaded if available (Node 20+)
  try {
    process.loadEnvFile?.('.env');
  } catch {
    // .env may not exist or may be loaded externally
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  const threadId = process.env.TELEGRAM_THREAD_ID?.trim();

  if (!botToken || !chatId) {
    console.error('[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment');
    return {
      ok: false,
      error: 'Telegram configuration missing. Please specify TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env',
    };
  }

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: htmlMessage,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  if (threadId) {
    const parsedThreadId = Number(threadId);
    if (!isNaN(parsedThreadId)) {
      payload.message_thread_id = parsedThreadId;
    }
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      const errMsg = data.description || `HTTP ${response.status}`;
      console.error('[Telegram Error]', errMsg);
      return { ok: false, error: errMsg };
    }

    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown network error';
    console.error('[Telegram Exception]', message);
    return { ok: false, error: message };
  }
}
