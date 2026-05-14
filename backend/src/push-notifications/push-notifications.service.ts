import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from '../devices/devices.service';
import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { randomUUID } from 'crypto';

const BACKUP_PUSH_GRACE_MS = 90_000;
const DEVICE_STALE_MS = 3 * 60_000;
const SYNC_STALE_MS = 5 * 60_000;
const BACKUP_PUSH_CLAIM_PREFIX = 'claim:';

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
    serverPlanId: string,
    localPlanId: string,
    title: string,
    body: string,
  ) {
    const tokens = await this.devicesService.getActiveTokens(userId);
    if (tokens.length === 0) {
      this.logger.warn(`No active push tokens for user ${userId}`);
      return { tickets: [], firstSuccessTicketId: null };
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
          data: { planId: localPlanId, type: 'walk_ready', notificationSource: 'backup_push' },
          categoryId: 'walk_ready_actions',
          priority: 'high' as const,
          channelId: 'gapwalk-nudges',
        } satisfies ExpoPushMessage,
      }));

    if (validPairs.length === 0) {
      this.logger.warn(`No valid Expo push tokens for user ${userId}`);
      return { tickets: [], firstSuccessTicketId: null };
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
          nudgePlanId: serverPlanId,
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

    return { tickets, firstSuccessTicketId };
  }

  private async releaseBackupPushClaim(
    planId: string,
    claimToken: string,
  ): Promise<void> {
    await this.prisma.nudgePlan.updateMany({
      where: {
        id: planId,
        pushTicketId: claimToken,
        pushSentAt: null,
      },
      data: {
        pushTicketId: null,
      },
    });
  }

  /**
   * Send push notifications for all planned nudges that are due.
   * Called by a cron/worker.
   */
  async sendDueNudges() {
    const now = new Date();
    const dueThreshold = new Date(now.getTime() - BACKUP_PUSH_GRACE_MS);
    const duePlans = await this.prisma.nudgePlan.findMany({
      where: {
        status: { in: ['planned', 'notified'] },
        walkStart: { lte: dueThreshold },
        notificationsEnabled: true,
        localReminderDeliveredAt: null,
        localId: { not: null },
        pushSentAt: null,
      },
      include: {
        user: {
          select: {
            timezone: true,
            lastSyncedAt: true,
            devices: {
              where: { isActive: true },
              select: { lastSeenAt: true },
            },
          },
        },
      },
    });

    this.logger.log(`Found ${duePlans.length} due nudge plans to send`);

    let sent = 0;
    for (const plan of duePlans) {
      const deviceFresh = !!plan.user?.devices?.some((device) =>
        !!device.lastSeenAt && now.getTime() - device.lastSeenAt.getTime() <= DEVICE_STALE_MS,
      );
      const syncFresh =
        !!plan.user?.lastSyncedAt &&
        now.getTime() - plan.user.lastSyncedAt.getTime() <= SYNC_STALE_MS;

      if (deviceFresh || syncFresh) {
        this.logger.log(`Suppressing backup push for plan ${plan.id}: device/sync still fresh`);
        continue;
      }

      const claimToken = `${BACKUP_PUSH_CLAIM_PREFIX}${randomUUID()}`;
      const claimed = await this.prisma.nudgePlan.updateMany({
        where: {
          id: plan.id,
          status: { in: ['planned', 'notified'] },
          notificationsEnabled: true,
          localReminderDeliveredAt: null,
          localId: { not: null },
          pushSentAt: null,
          pushTicketId: null,
        },
        data: {
          status: 'notified',
          pushTicketId: claimToken,
        },
      });
      if (claimed.count === 0) continue;

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

        const pushResult = await this.sendWalkNudge(
          plan.userId,
          plan.id,
          plan.localId!,
          `Walk ready now`,
          `${dur} min walk window is open at ${startTime}.`,
        );
        if (!pushResult.firstSuccessTicketId) {
          await this.releaseBackupPushClaim(plan.id, claimToken);
          continue;
        }

        await this.prisma.nudgePlan.updateMany({
          where: {
            id: plan.id,
            pushTicketId: claimToken,
            pushSentAt: null,
          },
          data: {
            pushTicketId: pushResult.firstSuccessTicketId,
            pushSentAt: new Date(),
          },
        });

        sent++;
      } catch (error) {
        this.logger.error(`Failed to send nudge for plan ${plan.id}: ${error}`);
        await this.releaseBackupPushClaim(plan.id, claimToken);
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
