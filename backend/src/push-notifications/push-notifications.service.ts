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

    const messages: ExpoPushMessage[] = tokens
      .filter((token) => Expo.isExpoPushToken(token))
      .map((token) => ({
        to: token,
        sound: 'default' as const,
        title,
        body,
        data: { planId, type: 'walk_nudge' },
        categoryId: 'walk_nudge_actions',
        priority: 'high' as const,
        channelId: 'gapwalk-nudges',
      }));

    if (messages.length === 0) {
      this.logger.warn(`No valid Expo push tokens for user ${userId}`);
      return [];
    }

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        this.logger.error(`Failed to send push chunk: ${error}`);
      }
    }

    // Log push results
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const token = tokens[i] ?? 'unknown';

      await this.prisma.pushLog.create({
        data: {
          userId,
          nudgePlanId: planId,
          expoPushToken: token,
          ticketId: ticket.status === 'ok' ? (ticket as any).id : null,
          status: ticket.status === 'ok' ? 'sent' : 'failed',
          errorMessage:
            ticket.status === 'error'
              ? `${(ticket as any).message} (${(ticket as any).details?.error})`
              : null,
          sentAt: new Date(),
        },
      });

      // Deactivate device if not registered
      if (
        ticket.status === 'error' &&
        (ticket as any).details?.error === 'DeviceNotRegistered'
      ) {
        await this.devicesService.deactivate(userId, token);
        this.logger.warn(`Deactivated unregistered device token: ${token}`);
      }
    }

    // Update nudge plan with push info
    if (tickets.length > 0 && tickets[0].status === 'ok') {
      try {
        await this.prisma.nudgePlan.update({
          where: { id: planId },
          data: {
            pushTicketId: (tickets[0] as any).id,
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
      },
      include: { user: true },
    });

    this.logger.log(`Found ${duePlans.length} due nudge plans to send`);

    for (const plan of duePlans) {
      try {
        const durationText = `${plan.suggestedDurationMinutes} min`;
        await this.sendWalkNudge(
          plan.userId,
          plan.id,
          "Time for a walk! 🚶",
          `You have a ${durationText} walking opportunity. Let's go!`,
        );

        await this.prisma.nudgePlan.update({
          where: { id: plan.id },
          data: { status: 'notified' },
        });
      } catch (error) {
        this.logger.error(
          `Failed to send nudge for plan ${plan.id}: ${error}`,
        );
      }
    }

    return { sent: duePlans.length };
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

    const ticketIds = pendingLogs
      .map((log) => log.ticketId!)
      .filter(Boolean);

    const receiptIdChunks =
      this.expo.chunkPushNotificationReceiptIds(ticketIds);

    for (const chunk of receiptIdChunks) {
      try {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);

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
