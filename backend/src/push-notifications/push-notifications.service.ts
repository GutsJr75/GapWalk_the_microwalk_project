import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from '../devices/devices.service';
import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private expo: Expo;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly devicesService: DevicesService,
  ) {
    const accessToken = this.configService.get<string>('expo.accessToken');
    this.expo = new Expo({ accessToken: accessToken || undefined });
  }

  /**
   * Send a walk nudge push to all active devices for a user.
   */
  async sendWalkNudge(
    userId: string,
    planId: string,
    title: string,
    body: string,
  ) {
    const tokens = await this.devicesService.getActiveTokens(userId);
    if (tokens.length === 0) {
      this.logger.warn(`No active push tokens for user ${userId}`);
      return [];
    }

    // Keep token <-> message pairing explicit so we can correlate
    // tickets back to tokens even when chunks fail mid-batch.
    const validPairs = tokens
      .filter((token) => Expo.isExpoPushToken(token))
      .map((token) => ({
        token,
        message: {
          to: token,
          sound: 'default' as const,
          title,
          body,
          data: { planId, type: 'walk_nudge' },
          categoryId: 'walk_nudge_actions',
          priority: 'high' as const,
          channelId: 'gapwalk-nudges',
        } satisfies ExpoPushMessage,
      }));

    if (validPairs.length === 0) {
      this.logger.warn(`No valid Expo push tokens for user ${userId}`);
      return [];
    }

    const messages = validPairs.map((p) => p.message);
    const chunks = this.expo.chunkPushNotifications(messages);
    const results: { token: string; ticket: ExpoPushTicket | null }[] = [];

    // Expo SDK preserves order across chunks, so we can walk the pairs array
    // in parallel with the concatenated ticket output. If a chunk throws, we
    // record nulls for those positions so the pairing stays aligned.
    let cursor = 0;
    for (const chunk of chunks) {
      const chunkSize = chunk.length;
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        for (let i = 0; i < chunkSize; i++) {
          results.push({
            token: validPairs[cursor + i].token,
            ticket: ticketChunk[i] ?? null,
          });
        }
      } catch (error) {
        this.logger.error(`Failed to send push chunk: ${error}`);
        for (let i = 0; i < chunkSize; i++) {
          results.push({
            token: validPairs[cursor + i].token,
            ticket: null,
          });
        }
      }
      cursor += chunkSize;
    }

    const tickets: ExpoPushTicket[] = [];
    let firstSuccessTicketId: string | null = null;

    for (const { token, ticket } of results) {
      let ticketId: string | null = null;
      let errorMessage: string | null = null;
      let status: 'sent' | 'failed' = 'failed';

      if (ticket && ticket.status === 'ok') {
        ticketId = ticket.id;
        status = 'sent';
        if (!firstSuccessTicketId) firstSuccessTicketId = ticket.id;
      } else if (ticket && ticket.status === 'error') {
        errorMessage = `${ticket.message} (${ticket.details?.error})`;
      } else {
        errorMessage = 'chunk_send_failed';
      }

      if (ticket) tickets.push(ticket);

      await this.prisma.pushLog.create({
        data: {
          userId,
          nudgePlanId: planId,
          expoPushToken: token,
          ticketId,
          status,
          errorMessage,
          sentAt: new Date(),
        },
      });

      if (ticket && ticket.status === 'error') {
        if (ticket.details?.error === 'DeviceNotRegistered') {
          await this.devicesService.deactivate(userId, token);
          this.logger.warn(`Deactivated unregistered device token: ${token}`);
        }
      }
    }

    if (firstSuccessTicketId) {
      try {
        await this.prisma.nudgePlan.update({
          where: { id: planId },
          data: {
            pushTicketId: firstSuccessTicketId,
            pushSentAt: new Date(),
          },
        });
      } catch (e) {
        this.logger.warn(`Could not update plan push info: ${e}`);
      }
    }

    return tickets;
  }

  /**
   * Send push notifications for all planned nudges that are due.
   * Called by a cron/worker.
   */
  async sendDueNudges() {
    const now = new Date();
    const duePlans = await this.prisma.nudgePlan.findMany({
      where: {
        status: 'planned',
        walkStart: { lte: now },
        origin: 'server',
        pushSentAt: null,
      },
      include: { user: true },
    });

    this.logger.log(`Found ${duePlans.length} due nudge plans to send`);

    let sent = 0;
    for (const plan of duePlans) {
      // Atomic claim: flip status + stamp pushSentAt in one UPDATE guarded
      // by the original (status='planned', pushSentAt=null) conditions.
      // If a concurrent worker already claimed the plan, count will be 0
      // and we skip — prevents the "4 duplicates" race.
      const claim = await this.prisma.nudgePlan.updateMany({
        where: {
          id: plan.id,
          status: 'planned',
          pushSentAt: null,
        },
        data: {
          status: 'notified',
          pushSentAt: now,
        },
      });
      if (claim.count === 0) continue;

      try {
        const walkStart = new Date(plan.walkStart);
        const dur = plan.suggestedDurationMinutes;
        const userTimezone = plan.user?.timezone ?? 'America/New_York';
        const startTime = walkStart.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: userTimezone,
        });

        // Rotate body variant by day-of-month for daily variety
        const variant = walkStart.getDate() % 6;
        const bodies = [
          `It's time! Head out for a ${dur}-minute walk. Your body will thank you.`,
          `Walk o'clock. ${dur} minutes is all it takes. Let's go!`,
          `Step outside for ${dur} minutes. A little movement goes a long way.`,
          `Your ${dur}-minute walking window is open. Time to move!`,
          `Fresh air awaits. Your ${dur}-minute walk starts now.`,
          `A ${dur}-minute walk is the reset your day needs. Let's do it!`,
        ];

        await this.sendWalkNudge(
          plan.userId,
          plan.id,
          `Your ${startTime} walk 🚶`,
          bodies[variant],
        );
        sent++;
      } catch (error) {
        this.logger.error(`Failed to send nudge for plan ${plan.id}: ${error}`);
      }
    }

    return { sent };
  }

  /**
   * Check push receipts for previously sent notifications.
   */
  async checkReceipts() {
    const pendingLogs = await this.prisma.pushLog.findMany({
      where: {
        status: 'sent',
        ticketId: { not: null },
        receiptCheckedAt: null,
      },
      take: 300,
    });

    if (pendingLogs.length === 0) return { checked: 0 };

    const ticketIds = pendingLogs.map((log) => log.ticketId!).filter(Boolean);

    const receiptIdChunks =
      this.expo.chunkPushNotificationReceiptIds(ticketIds);

    for (const chunk of receiptIdChunks) {
      try {
        const receipts =
          await this.expo.getPushNotificationReceiptsAsync(chunk);

        for (const [receiptId, receipt] of Object.entries(receipts)) {
          const log = pendingLogs.find((l) => l.ticketId === receiptId);
          if (!log) continue;

          let status: 'delivered' | 'failed' | 'device_not_registered' =
            'delivered';
          let errorMessage: string | null = null;

          if (receipt.status === 'error') {
            errorMessage = `${receipt.message} (${receipt.details?.error})`;
            status =
              receipt.details?.error === 'DeviceNotRegistered'
                ? 'device_not_registered'
                : 'failed';

            if (receipt.details?.error === 'DeviceNotRegistered') {
              await this.devicesService.deactivate(
                log.userId,
                log.expoPushToken,
              );
            }
          }

          await this.prisma.pushLog.update({
            where: { id: log.id },
            data: {
              status,
              errorMessage,
              receiptCheckedAt: new Date(),
            },
          });
        }
      } catch (error) {
        this.logger.error(`Failed to check receipts: ${error}`);
      }
    }

    return { checked: pendingLogs.length };
  }
}
