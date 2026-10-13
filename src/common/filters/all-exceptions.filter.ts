import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

import { ConflitoError, RecursoNaoEncontradoError } from '../../application/errors';
import { DomainError } from '../../domain/shared/DomainError';

interface ErroComCode {
  code: string;
  message: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof DomainError) {
      this.responderComCode(response, 422, 'Unprocessable Entity', exception);
      return;
    }

    if (exception instanceof RecursoNaoEncontradoError) {
      this.responderComCode(response, 404, 'Not Found', exception);
      return;
    }

    if (exception instanceof ConflitoError) {
      this.responderComCode(response, 409, 'Conflict', exception);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }

    this.logger.error('Erro não tratado', exception as Error);
    response.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Erro interno do servidor',
    });
  }

  private responderComCode(response: Response, statusCode: number, error: string, exception: ErroComCode): void {
    response.status(statusCode).json({ statusCode, error, code: exception.code, message: exception.message });
  }
}
