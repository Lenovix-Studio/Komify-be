import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SystemLogsService } from '@/modules/system/system-logs/system-logs.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly systemLogsService: SystemLogsService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as any).message || JSON.stringify(res);
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const stackTrace = exception instanceof Error ? exception.stack : null;

    this.logger.error(`HTTP ${status} Error: ${message}`, stackTrace);

    try {
      await this.systemLogsService.create({
        level: status >= 500 ? 'FATAL' : 'ERROR',
        source: 'BACKEND',
        message: Array.isArray(message) ? message.join(', ') : message,
        stack_trace: stackTrace || undefined,
        context: {
          url: request.url,
          method: request.method,
          body: request.body,
          query: request.query,
          params: request.params,
          ip: request.ip,
        },
      });
    } catch (logError) {
      this.logger.error('Failed to write log to database', logError);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
