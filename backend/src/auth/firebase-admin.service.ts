import { Injectable } from '@nestjs/common';
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
    const serviceAccountJson =
      this.configService.get<string>('firebase.serviceAccountJson') ?? '';

    if (serviceAccountJson.trim()) {
      const parsed = JSON.parse(serviceAccountJson) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      return initializeApp({
        credential: cert({
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: this.normalizePrivateKey(parsed.private_key ?? ''),
        }),
      });
    }

    if (projectId && clientEmail && privateKey) {
      return initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    return initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }

  private normalizePrivateKey(value: string): string {
    return value.replace(/\\n/g, '\n').trim();
  }
}
