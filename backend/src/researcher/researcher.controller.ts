import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ResearcherService } from './researcher.service';
import {
  CreateStudyDto,
  UpdateStudyDto,
  EnrollParticipantDto,
} from './dto/researcher.dto';

@ApiTags('researcher')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('researcher' as any, 'admin' as any)
@Controller('researcher/studies')
export class ResearcherController {
  constructor(private readonly researcherService: ResearcherService) {}

  // ───── STUDY CRUD ─────

  @Post()
  @ApiOperation({ summary: 'Create a new study' })
  create(@Body() dto: CreateStudyDto) {
    return this.researcherService.createStudy(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all studies' })
  findAll() {
    return this.researcherService.findAllStudies();
  }

  @Get(':studyId')
  @ApiOperation({ summary: 'Get a study with enrollments' })
  findOne(@Param('studyId') studyId: string) {
    return this.researcherService.findStudy(studyId);
  }

  @Patch(':studyId')
  @ApiOperation({ summary: 'Update a study' })
  update(@Param('studyId') studyId: string, @Body() dto: UpdateStudyDto) {
    return this.researcherService.updateStudy(studyId, dto);
  }

  @Delete(':studyId')
  @ApiOperation({ summary: 'Delete a study' })
  remove(@Param('studyId') studyId: string) {
    return this.researcherService.deleteStudy(studyId);
  }

  // ───── ENROLLMENT ─────

  @Post(':studyId/enroll')
  @ApiOperation({ summary: 'Enroll a participant in a study' })
  enroll(
    @Param('studyId') studyId: string,
    @Body() dto: EnrollParticipantDto,
  ) {
    return this.researcherService.enrollParticipant(studyId, dto.userId);
  }

  @Post(':studyId/withdraw/:userId')
  @ApiOperation({ summary: 'Withdraw a participant from a study' })
  withdraw(
    @Param('studyId') studyId: string,
    @Param('userId') userId: string,
  ) {
    return this.researcherService.withdrawParticipant(studyId, userId);
  }

  // ───── DATA EXPORT ─────

  @Get(':studyId/export')
  @ApiOperation({ summary: 'Export all study data' })
  exportData(@Param('studyId') studyId: string) {
    return this.researcherService.exportStudyData(studyId);
  }

  @Get(':studyId/summaries')
  @ApiOperation({ summary: 'Per-participant summaries for a study' })
  summaries(@Param('studyId') studyId: string) {
    return this.researcherService.getParticipantSummaries(studyId);
  }
}
