import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseAdminService } from './firebase-admin.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [FirebaseAdminService, JwtStrategy, JwtAuthGuard],
  exports: [FirebaseAdminService, JwtAuthGuard, JwtStrategy],
})
export class AuthModule {}
