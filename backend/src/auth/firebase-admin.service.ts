import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  App,
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';

@Injectable()
export class FirebaseAdminService {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private readonly app: App;
  private readonly auth: Auth;

  constructor(private readonly configService: ConfigService) {
    this.app = this.initializeFirebaseApp();
    this.auth = getAuth(this.app);
  }

  getAuth(): Auth {
    return this.auth;
  }

  private initializeFirebaseApp(): App {
    if (getApps().length > 0) {
      return getApp();
    }

    const projectId =
      this.configService.get<string>('firebase.projectId')?.trim() ?? '';
    const clientEmail =
      this.configService.get<string>('firebase.clientEmail')?.trim() ?? '';
    const privateKey = this.normalizePrivateKey(
      this.configService.get<string>('firebase.privateKey') ?? ''
    );
    const inferredProjectId = this.inferProjectIdFromClientEmail(clientEmail);
    const resolvedProjectId = projectId || inferredProjectId;
    const serviceAccountJson =
      this.configService.get<string>('firebase.serviceAccountJson') ?? '';

    if (serviceAccountJson.trim()) {
      const parsed = this.parseServiceAccountJson(serviceAccountJson);
      const serviceAccountProjectId =
        parsed.project_id?.trim() ||
        this.inferProjectIdFromClientEmail(parsed.client_email?.trim() ?? '');
      this.logger.log(
        `Initializing Firebase Admin with FIREBASE_SERVICE_ACCOUNT_JSON${serviceAccountProjectId ? ` for project ${serviceAccountProjectId}` : ''}.`
      );
      return initializeApp({
        credential: cert({
          projectId: serviceAccountProjectId,
          clientEmail: parsed.client_email,
          privateKey: this.normalizePrivateKey(parsed.private_key ?? ''),
        }),
      });
    }

    if (clientEmail && privateKey && resolvedProjectId) {
      if (!projectId && inferredProjectId) {
        this.logger.warn(
          `FIREBASE_PROJECT_ID is not set. Inferred Firebase project ID "${inferredProjectId}" from FIREBASE_CLIENT_EMAIL.`
        );
      }
      this.logger.log(
        `Initializing Firebase Admin with explicit Firebase env credentials for project ${resolvedProjectId}.`
      );
      return initializeApp({
        credential: cert({
          projectId: resolvedProjectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    const missing = [
      !resolvedProjectId ? 'FIREBASE_PROJECT_ID' : null,
      !clientEmail ? 'FIREBASE_CLIENT_EMAIL' : null,
      !privateKey ? 'FIREBASE_PRIVATE_KEY' : null,
      !serviceAccountJson.trim() ? 'FIREBASE_SERVICE_ACCOUNT_JSON' : null,
    ].filter((value): value is string => !!value);
    this.logger.warn(
      `Firebase Admin credentials are not fully configured. Falling back to application default credentials${resolvedProjectId ? ` for project ${resolvedProjectId}` : ''}. Missing Firebase env values: ${missing.join(', ')}. In local development this often causes Firebase ID token verification failures if ADC points at a different project.`
    );
    return initializeApp({
      credential: applicationDefault(),
      ...(resolvedProjectId ? { projectId: resolvedProjectId } : {}),
    });
  }

  private parseServiceAccountJson(value: string): {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  } {
    try {
      return JSON.parse(value) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ${message}`
      );
    }
  }

  private inferProjectIdFromClientEmail(value: string): string {
    const match = value.match(/^[^@]+@([^.]+)\.iam\.gserviceaccount\.com$/);
    return match?.[1]?.trim() ?? '';
  }

  private normalizePrivateKey(value: string): string {
    return value.replace(/\\n/g, '\n').trim();
  }
}
