#!/usr/bin/env node
/**
 * SendGrid dynamic templates for PlaySlot — build, upload and test them from
 * the repo, so the templates are version-controlled and the same in every
 * environment instead of being hand-edited in the SendGrid UI.
 *
 *   node scripts/sendgrid-templates.mjs preview            # render locally, no network
 *   node scripts/sendgrid-templates.mjs sync               # create/update in SendGrid, print the IDs
 *   node scripts/sendgrid-templates.mjs send --to me@x.com # one test send per template
 *   node scripts/sendgrid-templates.mjs send --to me@x.com --only booking_confirmed
 *
 * Needs SENDGRID_API_KEY (Mail Send + Template Engine) and MAIL_FROM in .env.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(here, '../src/mail/templates');
const ROOT = join(here, '../../..');

// ── env ──────────────────────────────────────────────────────────────────────
/** Minimal .env reader: the script runs outside Nest, before any build. */
function loadEnv() {
  for (const file of [join(ROOT, '.env'), join(ROOT, 'apps/api/.env')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, '');
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  }
}
loadEnv();

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.APP_BASE_URL ?? 'http://localhost:3000';

// ── the templates ───────────────────────────────────────────────────────
/**
 * `key` is what the API refers to the template by; `env` is the variable that
 * holds its id; `sample` drives both the local preview and the test send.
 */
export const TEMPLATES = [
  {
    key: 'welcome',
    env: 'SENDGRID_TEMPLATE_WELCOME',
    name: 'PLAYSLOT_TEMPLATE_WELCOME',
    body: 'welcome.html',
    sample: {
      subject: 'Добре дошли в PlaySlot',
      preheader: 'Профилът ви е готов — намерете корт или треньор.',
      heading: 'Добре дошли, Иван!',
      intro: 'Профилът ви в PlaySlot е готов. Ето как да стъпите на корта за по-малко от минута.',
      steps: [
        { number: 1, text: 'Изберете клуб и ден — виждате реалната наличност.' },
        { number: 2, text: 'Добавете треньор към резервацията, ако искате урок.' },
        { number: 3, text: 'Потвърдете часа и получавате имейл с детайлите.' },
      ],
      cta_label: 'Разгледай клубовете',
      cta_url: `${SITE_URL}/bg/clubs`,
      note: 'Ако не сте създавали профил, можете спокойно да изтриете това писмо.',
      site_url: SITE_URL,
    },
  },
  {
    key: 'verify_email',
    env: 'SENDGRID_TEMPLATE_VERIFY_EMAIL',
    name: 'PLAYSLOT_TEMPLATE_VERIFY_EMAIL',
    body: 'verify-email.html',
    sample: {
      subject: 'Потвърдете имейла си в PlaySlot',
      preheader: 'Един клик и профилът ви е активен.',
      heading: 'Потвърдете имейла си',
      intro: 'Потвърдете адреса си, за да можете да резервирате кортове и тренировки.',
      cta_label: 'Потвърди имейла',
      cta_url: `${SITE_URL}/bg/auth/verify-email?token=primer-token`,
      expiry_note: 'Връзката е валидна 24 часа. След това заявете нова от страницата за вход.',
      site_url: SITE_URL,
    },
  },
  {
    key: 'booking_received',
    env: 'SENDGRID_TEMPLATE_BOOKING_RECEIVED',
    name: 'PLAYSLOT_TEMPLATE_BOOKING_RECEIVED',
    body: 'booking-received.html',
    sample: {
      subject: 'Заявката ви е получена — Ace Tennis Center',
      preheader: 'Очаква потвърждение от клуба.',
      status_label: 'Очаква потвърждение',
      heading: 'Получихме заявката ви',
      intro: 'Запазихме часа за вас. Клубът ще го потвърди и ще получите второ писмо.',
      details: [
        { label: 'Клуб', value: 'Ace Tennis Center' },
        { label: 'Кога', value: 'сряда, 15 октомври, 18:00 – 19:00' },
        { label: 'Корт', value: 'Корт 2 · клей, на открито' },
        { label: 'Цена', value: '30,00 €' },
        { label: 'Номер', value: '#1042' },
      ],
      cta_label: 'Виж резервацията',
      cta_url: `${SITE_URL}/bg/me/bookings`,
      note: 'Ако клубът не потвърди часа, резервацията отпада и не дължите нищо.',
      site_url: SITE_URL,
    },
  },
  {
    key: 'booking_confirmed',
    env: 'SENDGRID_TEMPLATE_BOOKING_CONFIRMED',
    name: 'PLAYSLOT_TEMPLATE_BOOKING_CONFIRMED',
    body: 'booking-confirmed.html',
    sample: {
      subject: 'Потвърдена резервация — Ace Tennis Center',
      preheader: 'Часът ви е потвърден от клуба.',
      status_label: 'Потвърдена',
      heading: 'Часът ви е потвърден',
      intro: 'Клубът потвърди резервацията ви. Очакваме ви на корта.',
      details: [
        { label: 'Клуб', value: 'Ace Tennis Center' },
        { label: 'Кога', value: 'сряда, 15 октомври, 18:00 – 19:00' },
        { label: 'Корт', value: 'Корт 2 · клей, на открито' },
        { label: 'Треньор', value: 'Мария Треньор' },
        { label: 'Цена', value: '30,00 €' },
        { label: 'Номер', value: '#1042' },
      ],
      cta_label: 'Виж резервацията',
      cta_url: `${SITE_URL}/bg/me/bookings`,
      cancellation_note: 'Безплатна отмяна до 24 часа преди началото.',
      site_url: SITE_URL,
    },
  },
  {
    key: 'booking_cancelled',
    env: 'SENDGRID_TEMPLATE_BOOKING_CANCELLED',
    name: 'PLAYSLOT_TEMPLATE_BOOKING_CANCELLED',
    body: 'booking-cancelled.html',
    sample: {
      subject: 'Отменена резервация — 360 Тенис клуб',
      preheader: 'Възстановена сума: 14,00 EUR.',
      status_label: 'Отменена',
      heading: 'Резервацията ви е отменена',
      intro: 'Часът в 360 Тенис клуб на понеделник, 12 октомври, 09:00 – 10:00 вече не е запазен за вас.',
      details: [
        { label: 'Клуб', value: '360 Тенис клуб' },
        { label: 'Кога', value: 'понеделник, 12 октомври, 09:00 – 10:00' },
        { label: 'Корт', value: 'Централен · клей, на открито' },
        { label: 'Цена', value: '14,00 EUR' },
        { label: 'Номер', value: '#1' },
      ],
      refund_note: 'Възстановена сума: 14,00 EUR — връща се по начина на плащане до няколко работни дни.',
      cta_label: 'Намери друг час',
      cta_url: `${SITE_URL}/bg/clubs`,
      note: 'Отменили сте по погрешка? Часът вече е свободен за всички — запазете го отново.',
      site_url: SITE_URL,
    },
  },
  {
    key: 'notice',
    env: 'SENDGRID_TEMPLATE_NOTICE',
    name: 'PLAYSLOT_TEMPLATE_NOTICE',
    body: 'notice.html',
    sample: {
      subject: 'Преместена резервация — 360 Тенис клуб',
      preheader: 'Новият час е в понеделник от 10:00.',
      status_label: 'Преместена',
      status_bg: '#f1f3f1',
      status_fg: '#4b564f',
      heading: 'Часът ви е преместен',
      intro: 'Клубът премести резервацията ви в 360 Тенис клуб. Новият час е по-долу.',
      details: [
        { label: 'Клуб', value: '360 Тенис клуб' },
        { label: 'Нов час', value: 'понеделник, 12 октомври, 10:00 – 11:00' },
        { label: 'Беше', value: 'понеделник, 12 октомври, 09:00 – 10:00' },
      ],
      highlight: null,
      cta_label: 'Виж резервацията',
      cta_url: `${SITE_URL}/bg/me/bookings`,
      fallback_url: null,
      note: 'Новият час не ви устройва? Можете да го откажете от профила си.',
      site_url: SITE_URL,
    },
  },
];

// ── rendering ────────────────────────────────────────────────────────────────
const read = (f) => readFileSync(join(TEMPLATES_DIR, f), 'utf8');

/** shell + body, the exact HTML uploaded to SendGrid. */
export function buildHtml(body) {
  return read('shell.html').replace('{{{BODY}}}', read(body));
}

/**
 * A tiny Handlebars subset — {{var}}, {{#if}}, {{#each}} — used ONLY for the
 * local preview. SendGrid renders the real thing; this just lets us look at a
 * template without sending mail.
 */
function renderPreview(html, data) {
  const get = (ctx, path) =>
    path.split('.').reduce((v, k) => (v == null ? v : k === 'this' ? (v.this ?? v) : v[k]), ctx);
  const section = (tpl, ctx) => {
    let out = tpl.replace(/\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, path, inner) => {
      const list = get(ctx, path) ?? [];
      return list.map((item) => section(inner, { ...ctx, this: item })).join('');
    });
    out = out.replace(/\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, path, inner) =>
      get(ctx, path) ? section(inner, ctx) : '',
    );
    return out.replace(/\{\{\{?\s*([\w.]+)\s*\}?\}\}/g, (_, path) => String(get(ctx, path) ?? ''));
  };
  return section(html, data);
}

// ── SendGrid API ─────────────────────────────────────────────────────────────
const API = 'https://api.sendgrid.com/v3';

function apiKey() {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) {
    console.error(
      'SENDGRID_API_KEY is not set. Add it to .env (SendGrid → Settings → API Keys,\n' +
        'with "Mail Send" and "Template Engine" permissions) and run this again.',
    );
    process.exit(1);
  }
  return key;
}

async function sg(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const hint =
      res.status === 401
        ? ' — the API key was rejected. Check SENDGRID_API_KEY in .env (no quotes, no trailing spaces).'
        : res.status === 403
          ? ' — the key is missing a permission. It needs "Template Engine" (full access) for sync, and "Mail Send" for send.'
          : '';
    throw new Error(`SendGrid ${init.method ?? 'GET'} ${path} → ${res.status}: ${text}${hint}`);
  }
  return text ? JSON.parse(text) : null;
}

/** Templates are matched by name, so a re-run updates instead of duplicating. */
async function findTemplateByName(name) {
  const all = [];
  let pageToken;
  do {
    const qs = new URLSearchParams({ generations: 'dynamic', page_size: '200' });
    if (pageToken) qs.set('page_token', pageToken);
    const page = await sg(`/templates?${qs.toString()}`);
    all.push(...(page.result ?? []));
    const next = page._metadata?.next;
    pageToken = next ? new URL(next).searchParams.get('page_token') : undefined;
  } while (pageToken);
  return all.find((t) => t.name === name);
}

async function sync() {
  const key = apiKey();
  console.log(`using SENDGRID_API_KEY ${key.slice(0, 6)}…${key.slice(-4)} (${key.length} chars)\n`);
  const lines = [];
  for (const tpl of TEMPLATES) {
    const html = buildHtml(tpl.body);
    let template = await findTemplateByName(tpl.name);
    if (!template) {
      template = await sg('/templates', {
        method: 'POST',
        body: JSON.stringify({ name: tpl.name, generation: 'dynamic' }),
      });
      console.log(`created  ${tpl.name}  (${template.id})`);
    } else {
      console.log(`found    ${tpl.name}  (${template.id})`);
    }

    // A new active version each run keeps the history in SendGrid intact.
    const version = {
      template_id: template.id,
      name: `repo ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      subject: '{{subject}}',
      html_content: html,
      plain_content: '{{preheader}}\n\n{{heading}}\n\n{{intro}}\n\n{{cta_url}}',
      generate_plain_content: false,
      active: 1,
    };
    await sg(`/templates/${template.id}/versions`, { method: 'POST', body: JSON.stringify(version) });
    console.log(`uploaded version for ${tpl.key}`);
    lines.push(`${tpl.env}=${template.id}`);
  }

  console.log('\nAdd these to your .env:\n');
  console.log(lines.join('\n'));
}

/** The assembled HTML, Handlebars intact — what SendGrid's code editor wants. */
async function build() {
  const out = join(here, '../.mail-build');
  mkdirSync(out, { recursive: true });
  for (const tpl of TEMPLATES) {
    const file = join(out, `${tpl.name}.html`);
    writeFileSync(file, buildHtml(tpl.body));
    console.log(`wrote ${file}`);
  }
  console.log('\nPaste each file into the matching SendGrid template (Code editor),');
  console.log('and set the version Subject to:  {{subject}}');
}

async function preview() {
  const out = join(here, '../.mail-preview');
  mkdirSync(out, { recursive: true });
  for (const tpl of TEMPLATES) {
    const file = join(out, `${tpl.key}.html`);
    writeFileSync(file, renderPreview(buildHtml(tpl.body), tpl.sample));
    console.log(`wrote ${file}`);
  }
  console.log('\nOpen them in a browser to check the layout.');
}

async function send(to, only) {
  const from = process.env.MAIL_FROM;
  if (!from) {
    console.error('MAIL_FROM is not set. Use a sender you have verified in SendGrid.');
    process.exit(1);
  }
  const parsed = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const fromObj = parsed ? { name: parsed[1], email: parsed[2] } : { email: from.trim() };

  for (const tpl of TEMPLATES) {
    if (only && tpl.key !== only) continue;
    const id = process.env[tpl.env];
    if (!id) {
      console.error(`${tpl.env} is not set — run "sync" first.`);
      process.exit(1);
    }
    await sg('/mail/send', {
      method: 'POST',
      body: JSON.stringify({
        from: fromObj,
        personalizations: [{ to: [{ email: to }], dynamic_template_data: tpl.sample }],
        template_id: id,
      }),
    });
    console.log(`sent ${tpl.key} → ${to}`);
  }
}

// ── cli ──────────────────────────────────────────────────────────────────────
const [, , cmd, ...rest] = process.argv;
const arg = (flag) => {
  const i = rest.indexOf(flag);
  return i === -1 ? undefined : rest[i + 1];
};

try {
  if (cmd === 'preview') await preview();
  else if (cmd === 'build') await build();
  else if (cmd === 'sync') await sync();
  else if (cmd === 'send') {
    const to = arg('--to');
    if (!to) throw new Error('send needs --to <email>');
    await send(to, arg('--only'));
  } else {
    console.log(
      'usage: sendgrid-templates.mjs <build|preview|sync|send --to you@example.com [--only key]>',
    );
    process.exit(1);
  }
} catch (err) {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
}
