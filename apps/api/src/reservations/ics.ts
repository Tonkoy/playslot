/**
 * A single booking as an iCalendar (RFC 5545) event — the format every
 * calendar app imports: Apple Calendar on iPhone and Mac, Google Calendar,
 * Outlook, Samsung Calendar.
 */

/** Text values escape backslash, semicolon, comma and newlines (RFC 5545 §3.3.11). */
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** 20261128T160000Z */
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Lines longer than 75 octets are folded (RFC 5545 §3.1), without splitting a UTF-8 character. */
function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, 'utf8');
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function bookingIcs(e: {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location: string;
  description: string;
  url: string;
  status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  /** Minutes before the start for a reminder. */
  alarmMin: number;
  alarmText: string;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PlaySlot//Bookings//BG',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(e.end)}`,
    `SUMMARY:${text(e.summary)}`,
    `LOCATION:${text(e.location)}`,
    `DESCRIPTION:${text(e.description)}`,
    `URL:${e.url}`,
    `STATUS:${e.status}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `TRIGGER:-PT${e.alarmMin}M`,
    `DESCRIPTION:${text(e.alarmText)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
