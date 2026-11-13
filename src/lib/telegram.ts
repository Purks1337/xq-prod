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
  deliveredCount?: number;
  totalCount?: number;
}

export async function sendTelegramMessage(htmlMessage: string): Promise<TelegramSendResult> {
  // Ensure local .env is loaded if available (Node 20+)
  try {
    process.loadEnvFile?.('.env');
  } catch {
    // .env may not exist or may be loaded externally
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const rawChatIds = process.env.TELEGRAM_CHAT_ID?.trim() || '';
  const threadId = process.env.TELEGRAM_THREAD_ID?.trim();
  const apiBase = (process.env.TELEGRAM_API_BASE?.trim() || 'https://api.telegram.org').replace(/\/$/, '');

  // Parse chat IDs (comma, semicolon, or whitespace separated)
  const chatIds = rawChatIds
    .split(/[,;\s]+/)
    .map((id) => id.trim())
    .filter(Boolean);

  if (!botToken || chatIds.length === 0) {
    console.error('[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment');
    return {
      ok: false,
      error: 'Telegram configuration missing. Please specify TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env',
    };
  }

  let deliveredCount = 0;
  const errors: string[] = [];

  // Send in parallel to all recipients
  const promises = chatIds.map(async (chatId) => {
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
      const response = await fetch(`${apiBase}/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        const errMsg = data.description || `HTTP ${response.status}`;
        console.error(`[Telegram Error] chat_id=${chatId}:`, errMsg);
        return { ok: false, chatId, error: errMsg };
      }

      return { ok: true, chatId };
    } catch (err: unknown) {
      const errorObj = err as { message?: string; cause?: { message?: string; code?: string } };
      const causeDetail = errorObj?.cause ? ` (cause: ${errorObj.cause.code || errorObj.cause.message || ''})` : '';
      const message = (errorObj?.message || 'Unknown network error') + causeDetail;
      console.error(`[Telegram Exception] chat_id=${chatId}:`, message);
      return { ok: false, chatId, error: message };
    }
  });

  const sendResults = await Promise.all(promises);

  for (const res of sendResults) {
    if (res.ok) {
      deliveredCount++;
    } else {
      errors.push(`${res.chatId}: ${res.error}`);
    }
  }

  if (deliveredCount === 0) {
    return {
      ok: false,
      error: errors.join('; '),
      deliveredCount: 0,
      totalCount: chatIds.length,
    };
  }

  return {
    ok: true,
    deliveredCount,
    totalCount: chatIds.length,
  };
}
