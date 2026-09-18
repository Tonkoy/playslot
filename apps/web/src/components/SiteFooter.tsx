import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BrandMark } from '@/components/BrandMark';

/**
 * Global site footer: brand blurb + link columns, on the deep-green primary
 * surface (per the design system: deep green is the primary brand surface —
 * headers, footers, primary buttons — with white doing the text work on it).
 */
export async function SiteFooter() {
  const c = await getTranslations('Common');
  const nav = await getTranslations('Nav');
  const f = await getTranslations('Footer');

  return (
    <footer style={{ background: 'var(--green-deep)', color: '#fff', marginTop: 40 }}>
      <div
        style={{
          maxWidth: 'var(--maxw)',
          margin: '0 auto',
          padding: '48px 20px 28px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 32,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BrandMark size={30} />
            <span style={{ fontWeight: 800, fontSize: 18 }}>{c('appName')}</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 14, marginTop: 10, maxWidth: '32ch' }}>{c('tagline')}</p>
        </div>

        <div>
          <div className="mono" style={footerHeading}>{f('exploreHeading')}</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <Link href="/clubs" style={footerLink}>{nav('clubs')}</Link>
            <Link href="/coaches" style={footerLink}>{nav('coaches')}</Link>
            <Link href="/sessions" style={footerLink}>{nav('sessions')}</Link>
          </nav>
        </div>

        <div>
          <div className="mono" style={footerHeading}>{f('accountHeading')}</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <Link href="/me/bookings" style={footerLink}>{nav('bookings')}</Link>
            <Link href="/me/favorites" style={footerLink}>{nav('favorites')}</Link>
            <Link href="/login" style={footerLink}>{nav('login')}</Link>
            <Link href="/register" style={footerLink}>{nav('register')}</Link>
          </nav>
        </div>

        <div>
          <div className="mono" style={footerHeading}>{f('supportHeading')}</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <Link href="/docs" style={footerLink}>{f('docsLabel')}</Link>
            <Link href="/contact" style={footerLink}>{f('contactLabel')}</Link>
          </nav>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,.14)' }}>
        <div
          style={{
            maxWidth: 'var(--maxw)',
            margin: '0 auto',
            padding: '18px 20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'space-between',
            fontSize: 12.5,
            color: 'rgba(255,255,255,.6)',
          }}
        >
          <span>{f('rights', { year: new Date().getFullYear(), appName: c('appName') })}</span>
          <span>{c('tagline')}</span>
        </div>
      </div>
    </footer>
  );
}

const footerHeading: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,.55)',
};
const footerLink: React.CSSProperties = {
  color: '#fff',
  fontSize: 14.5,
  textDecoration: 'none',
};
