import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { DashboardSpaController } from './dashboard-spa.controller';
import { DashboardSpaService } from './dashboard-spa.service';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'dashboard', 'public'),
      serveRoot: '/dashboard',
      serveStaticOptions: { index: ['index.html'] },
    }),
  ],
  controllers: [DashboardSpaController],
  providers: [DashboardSpaService],
})
export class DashboardSpaModule {}
