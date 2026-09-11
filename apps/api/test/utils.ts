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
  welcomes: { to: string; name: string }[] = [];
  confirmations: { to: string }[] = [];
  cancellations: { to: string; refundCents: number }[] = [];
  staffNotices: { to: string; customerName: string; what: string }[] = [];
  coachNotices: { to: string; customerName: string }[] = [];
  staffCancellations: { to: string; customerName: string; what: string }[] = [];
  coachCancellations: { to: string; customerName: string }[] = [];
  reschedules: { to: string; previousWhen?: string }[] = [];
  staffReschedules: { to: string; customerName: string }[] = [];
  coachReschedules: { to: string; customerName: string }[] = [];
  receipts: { to: string }[] = [];
  noShows: { to: string }[] = [];
  passwordChanges: { to: string }[] = [];
  coachSchedules: {
    to: string;
    coachName: string;
    date: string;
    lessons: { time: string; clubName: string; customerName: string }[];
  }[] = [];
  groupInvites: { to: string; title: string }[] = [];
  groupCancellations: { to: string; title: string }[] = [];
  accountInvites: { to: string; link: string; role: string }[] = [];

  async send(input: SendEmailInput) {
    this.sent.push(input);
  }
  async sendVerification(to: string, link: string, _locale?: ApiLocale) {
    this.verifications.push({ to, link });
  }
  async sendPasswordReset(to: string, link: string, _locale?: ApiLocale) {
    this.resets.push({ to, link });
  }
  async sendWelcome(to: string, name: string, _locale?: ApiLocale) {
    this.welcomes.push({ to, name });
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
  async sendStaffBookingNotice(
    to: string,
    info: { customerName: string; what: string },
    _locale?: ApiLocale,
  ) {
    this.staffNotices.push({ to, customerName: info.customerName, what: info.what });
  }
  async sendCoachBookingNotice(
    to: string,
    info: { customerName: string },
    _locale?: ApiLocale,
  ) {
    this.coachNotices.push({ to, customerName: info.customerName });
  }
  async sendCoachDailySchedule(
    to: string,
    info: {
      coachName: string;
      date: string;
      lessons: { time: string; clubName: string; customerName: string }[];
    },
    _locale?: ApiLocale,
  ) {
    this.coachSchedules.push({ to, ...info });
  }
  async sendStaffCancellationNotice(
    to: string,
    info: { customerName: string; what: string },
    _locale?: ApiLocale,
  ) {
    this.staffCancellations.push({ to, customerName: info.customerName, what: info.what });
  }
  async sendCoachCancellationNotice(to: string, info: { customerName: string }, _locale?: ApiLocale) {
    this.coachCancellations.push({ to, customerName: info.customerName });
  }
  async sendReschedule(to: string, info: { previousWhen?: string }, _locale?: ApiLocale) {
    this.reschedules.push({ to, previousWhen: info.previousWhen });
  }
  async sendStaffRescheduleNotice(to: string, info: { customerName: string }, _locale?: ApiLocale) {
    this.staffReschedules.push({ to, customerName: info.customerName });
  }
  async sendCoachRescheduleNotice(to: string, info: { customerName: string }, _locale?: ApiLocale) {
    this.coachReschedules.push({ to, customerName: info.customerName });
  }
  async sendPaymentReceipt(to: string, _info: unknown, _locale?: ApiLocale) {
    this.receipts.push({ to });
  }
  async sendNoShowNotice(to: string, _info: unknown, _locale?: ApiLocale) {
    this.noShows.push({ to });
  }
  async sendPasswordChanged(to: string, _locale?: ApiLocale) {
    this.passwordChanges.push({ to });
  }
  async sendGroupSessionInvite(to: string, info: { title: string }, _link: string, _locale?: ApiLocale) {
    this.groupInvites.push({ to, title: info.title });
  }
  async sendGroupSessionCancelled(to: string, info: { title: string }, _locale?: ApiLocale) {
    this.groupCancellations.push({ to, title: info.title });
  }
  async sendAccountInvite(to: string, link: string, info: { role: string }, _locale?: ApiLocale) {
    this.accountInvites.push({ to, link, role: info.role });
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

  const app = moduleRef.createNestApplication({ rawBody: true });
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
