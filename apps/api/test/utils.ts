import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { MailService, type SendEmailInput } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import type { ApiLocale } from '../src/common/i18n';

/** Captures outbound mail so tests can read the raw verification/reset links. */
export class FakeMail {
  sent: SendEmailInput[] = [];
  verifications: { to: string; link: string }[] = [];
  resets: { to: string; link: string }[] = [];
  confirmations: { to: string }[] = [];
  cancellations: { to: string; refundCents: number }[] = [];

  async send(input: SendEmailInput) {
    this.sent.push(input);
  }
  async sendVerification(to: string, link: string, _locale?: ApiLocale) {
    this.verifications.push({ to, link });
  }
  async sendPasswordReset(to: string, link: string, _locale?: ApiLocale) {
    this.resets.push({ to, link });
  }
  async sendConfirmation(to: string, _info: unknown, _locale?: ApiLocale) {
    this.confirmations.push({ to });
  }
  async sendCancellation(
    to: string,
    info: { refundCents: number },
    _locale?: ApiLocale,
  ) {
    this.cancellations.push({ to, refundCents: info.refundCents });
  }

  tokenFrom(link: string): string {
    return new URL(link).searchParams.get('token') ?? '';
  }
  lastVerificationToken(): string {
    const last = this.verifications.at(-1);
    return last ? this.tokenFrom(last.link) : '';
  }
  lastResetToken(): string {
    const last = this.resets.at(-1);
    return last ? this.tokenFrom(last.link) : '';
  }
}

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  mail: FakeMail;
}

export async function createTestApp(): Promise<TestApp> {
  const mail = new FakeMail();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();

  return { app, prisma: app.get(PrismaService), mail };
}

/** Wipes all data in FK-safe order — call before each e2e file. */
export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$transaction([
    prisma.reservationResource.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.priceRule.deleteMany(),
    prisma.availabilityRule.deleteMany(),
    prisma.resourceException.deleteMany(),
    prisma.coachService.deleteMany(),
    prisma.coachClub.deleteMany(),
    prisma.resource.deleteMany(),
    prisma.cancellationPolicy.deleteMany(),
    prisma.clubMember.deleteMany(),
    prisma.coachProfile.deleteMany(),
    prisma.playerProfile.deleteMany(),
    prisma.verificationToken.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.club.deleteMany(),
    prisma.city.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
