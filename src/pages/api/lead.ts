export const prerender = false;

import type { APIRoute } from 'astro';
import { escapeHtml, sendTelegramMessage } from '../../lib/telegram';

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, any> = {};

  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    try {
      const formData = await request.formData();
      const formats: string[] = [];
      formData.forEach((value, key) => {
        if (key === 'format') {
          formats.push(String(value));
        } else {
          body[key] = value;
        }
      });
      if (formats.length > 0) {
        body.format = formats.join(', ');
      }
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Failed to parse form data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Unsupported Content-Type' }), {
        status: 415,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
  const service = typeof body.service === 'string' ? body.service.trim() : '';
  const budget = typeof body.budget === 'string' ? body.budget.trim() : '';
  const format = Array.isArray(body.format) ? body.format.join(', ') : (typeof body.format === 'string' ? body.format.trim() : '');
  const link = typeof body.link === 'string' ? body.link.trim() : '';
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const details = typeof body.details === 'string' ? body.details.trim() : '';
  const about = typeof body.about === 'string' ? body.about.trim() : '';
  const discount = typeof body.discount === 'string' ? body.discount.trim() : '';
  const page = typeof body.page === 'string' ? body.page.trim() : (request.headers.get('referer') || '');

  // Analytics fields
  const utmSource = typeof body.utm_source === 'string' ? body.utm_source.trim() : '';
  const utmMedium = typeof body.utm_medium === 'string' ? body.utm_medium.trim() : '';
  const utmCampaign = typeof body.utm_campaign === 'string' ? body.utm_campaign.trim() : '';
  const utmContent = typeof body.utm_content === 'string' ? body.utm_content.trim() : '';
  const utmTerm = typeof body.utm_term === 'string' ? body.utm_term.trim() : '';
  const yclid = typeof body.yclid === 'string' ? body.yclid.trim() : '';
  const gclid = typeof body.gclid === 'string' ? body.gclid.trim() : '';
  const landingPage = typeof body.landing_page === 'string' ? body.landing_page.trim() : '';
  const referrer = typeof body.referrer === 'string' ? body.referrer.trim() : '';
  const device = typeof body.device === 'string' ? body.device.trim() : '';
  const timeOnSite = typeof body.time_on_site === 'string' ? body.time_on_site.trim() : '';
  const ymUid = typeof body.ym_uid === 'string' ? body.ym_uid.trim() : '';

  if (!contact) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Пожалуйста, укажите телефон или Telegram' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Екатеринбургское время (Asia/Yekaterinburg, UTC+5)
  const dateEkb = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  const lines: string[] = [
    '🎬 <b>Новая заявка · Хвалите Media</b>',
    '',
    `👤 <b>Имя / Компания:</b> ${name ? escapeHtml(name) : '<i>Не указано</i>'}`,
    `📞 <b>Контакт:</b> <code>${escapeHtml(contact)}</code>`,
  ];

  if (service) {
    lines.push(`🎯 <b>Услуга:</b> ${escapeHtml(service)}`);
  }
  if (budget) {
    lines.push(`💰 <b>Бюджет:</b> ${escapeHtml(budget)}`);
  }
  if (format) {
    lines.push(`📌 <b>Формат / Где покажут:</b> ${escapeHtml(format)}`);
  }
  if (date) {
    lines.push(`📅 <b>Дата премьеры:</b> ${escapeHtml(date)}`);
  }
  if (details) {
    lines.push(`📍 <b>Детали / Площадка:</b> ${escapeHtml(details)}`);
  }
  if (link) {
    lines.push(`🔗 <b>ТЗ / CAD / Ссылка:</b> ${escapeHtml(link)}`);
  }
  if (discount) {
    lines.push(`🎁 <b>Скидка / Промокод:</b> ${escapeHtml(discount)}`);
  }
  if (about) {
    lines.push('', '📝 <b>О задаче:</b>', `<blockquote>${escapeHtml(about)}</blockquote>`);
  }

  // Блок маркетинга и аналитики
  const hasUtm = utmSource || utmMedium || utmCampaign || utmContent || utmTerm || yclid || gclid;
  if (hasUtm) {
    lines.push('', '📊 <b>Реклама / UTM:</b>');
    if (utmSource || utmMedium) {
      lines.push(`• <b>Источник / Канал:</b> ${escapeHtml(utmSource || '—')} / ${escapeHtml(utmMedium || '—')}`);
    }
    if (utmCampaign) lines.push(`• <b>Кампания:</b> ${escapeHtml(utmCampaign)}`);
    if (utmContent) lines.push(`• <b>Объявление:</b> ${escapeHtml(utmContent)}`);
    if (utmTerm) lines.push(`• <b>Ключевое слово:</b> ${escapeHtml(utmTerm)}`);
    if (yclid) lines.push(`• <b>Yclid (Директ):</b> <code>${escapeHtml(yclid)}</code>`);
    if (gclid) lines.push(`• <b>Gclid (Google):</b> <code>${escapeHtml(gclid)}</code>`);
  }

  // Детали визита
  lines.push('', '🌐 <b>Детали визита:</b>');
  if (device) lines.push(`• <b>Устройство:</b> ${escapeHtml(device)}`);
  if (timeOnSite) lines.push(`• <b>Время до заявки:</b> ${escapeHtml(timeOnSite)}`);
  if (ymUid) lines.push(`• <b>Yandex ClientID:</b> <code>${escapeHtml(ymUid)}</code>`);
  if (referrer && referrer !== 'Прямой заход') lines.push(`• <b>Откуда пришёл:</b> ${escapeHtml(referrer)}`);
  if (landingPage && landingPage !== page) lines.push(`• <b>Первая страница:</b> ${escapeHtml(landingPage)}`);
  lines.push(`• <b>Страница заявки:</b> ${page ? escapeHtml(page) : '—'}`);

  lines.push('', `⏰ <b>Время (ЕКБ, UTC+5):</b> ${escapeHtml(dateEkb)}`);

  const message = lines.join('\n');
  const result = await sendTelegramMessage(message);

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: result.error || 'Не удалось отправить заявку в Telegram',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: 'Заявка успешно принята и отправлена в Telegram',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
