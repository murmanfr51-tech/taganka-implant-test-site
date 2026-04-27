const DEFAULT_LEAD_EMAIL = 'i@amokshin.ru';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { name = '', phone = '', message = '', source = '' } = req.body || {};

    const cleanName = String(name).trim();
    const cleanPhone = String(phone).trim();
    const cleanMessage = String(message).trim();
    const cleanSource = String(source).trim();

    if (!cleanName || !cleanPhone) {
      return res.status(400).json({ ok: false, error: 'Укажите имя и телефон.' });
    }

    const lead = {
      name: cleanName,
      phone: cleanPhone,
      message: cleanMessage,
      source: cleanSource,
      createdAt: new Date().toISOString()
    };

    if (process.env.LEAD_WEBHOOK_URL) {
      const webhookResponse = await fetch(process.env.LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead)
      });

      if (!webhookResponse.ok) {
        const text = await webhookResponse.text();
        throw new Error(`Webhook error: ${webhookResponse.status} ${text}`);
      }

      return res.status(200).json({ ok: true, mode: 'webhook' });
    }

    const emailTo = process.env.LEAD_EMAIL_TO || DEFAULT_LEAD_EMAIL;

    if (process.env.RESEND_API_KEY) {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.LEAD_EMAIL_FROM || 'Taganka Implant Site <onboarding@resend.dev>',
          to: [emailTo],
          subject: 'Новая заявка с лендинга Taganka Implant Center',
          html: renderLeadHtml(lead)
        })
      });

      if (!emailResponse.ok) {
        const text = await emailResponse.text();
        throw new Error(`Resend error: ${emailResponse.status} ${text}`);
      }

      return res.status(200).json({ ok: true, mode: 'resend' });
    }

    const formSubmitResponse = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(emailTo)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        _subject: 'Новая заявка с лендинга Taganka Implant Center',
        _template: 'table',
        _captcha: 'false',
        name: cleanName,
        phone: cleanPhone,
        message: cleanMessage || '—',
        source: cleanSource || 'direct',
        createdAt: lead.createdAt
      })
    });

    const formSubmitResult = await formSubmitResponse.json().catch(() => ({}));

    if (!formSubmitResponse.ok || formSubmitResult.success === 'false') {
      throw new Error(formSubmitResult.message || 'FormSubmit error');
    }

    return res.status(200).json({ ok: true, mode: 'formsubmit' });
  } catch (error) {
    console.error('Lead submit failed', error);
    return res.status(500).json({ ok: false, error: 'Не удалось отправить заявку. Попробуйте ещё раз.' });
  }
}

function renderLeadHtml({ name, phone, message, source, createdAt }) {
  return `
    <h2>Новая заявка</h2>
    <p><strong>Имя:</strong> ${escapeHtml(name)}</p>
    <p><strong>Телефон:</strong> ${escapeHtml(phone)}</p>
    <p><strong>Сообщение:</strong><br>${escapeHtml(message || '—').replace(/\n/g, '<br>')}</p>
    <p><strong>Источник:</strong> ${escapeHtml(source || 'direct')}</p>
    <p><strong>Время:</strong> ${escapeHtml(createdAt)}</p>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
