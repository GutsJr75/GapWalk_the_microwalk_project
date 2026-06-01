import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { HealthService } from './health.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness/readiness probe — reports DB and Redis connectivity',
  })
  async check(@Res() res: Response) {
    const report = await this.healthService.check();
    // 200 when healthy, 503 when a dependency is down so orchestrators and the
    // Docker healthcheck treat a degraded instance as unhealthy.
    const httpStatus =
      report.status === 'ok'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(httpStatus).json(report);
  }
}
