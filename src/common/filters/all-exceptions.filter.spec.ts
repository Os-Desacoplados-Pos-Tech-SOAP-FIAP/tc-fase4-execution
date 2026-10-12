import { ArgumentsHost, BadRequestException, HttpException, Logger } from '@nestjs/common';

import { ConflitoError, RecursoNaoEncontradoError } from '../../application/errors';
import { DomainError } from '../../domain/shared/DomainError';
import { AllExceptionsFilter } from './all-exceptions.filter';

function criarHost() {
  const response = { status: jest.fn(), json: jest.fn() };
  response.status.mockReturnValue(response);
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('AllExceptionsFilter', () => {
  const filtro = new AllExceptionsFilter();

  it('DomainError vira 422 com code', () => {
    const { host, response } = criarHost();
    filtro.catch(new DomainError('Estoque insuficiente', 'ESTOQUE_INSUFICIENTE'), host);
    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 422,
      error: 'Unprocessable Entity',
      code: 'ESTOQUE_INSUFICIENTE',
      message: 'Estoque insuficiente',
    });
  });

  it('RecursoNaoEncontradoError vira 404 com code', () => {
    const { host, response } = criarHost();
    filtro.catch(new RecursoNaoEncontradoError('Serviço'), host);
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'Not Found',
      code: 'RECURSO_NAO_ENCONTRADO',
      message: 'Serviço não encontrado(a)',
    });
  });

  it('ConflitoError vira 409 com code', () => {
    const { host, response } = criarHost();
    filtro.catch(new ConflitoError('Já existe', 'INSUMO_CODIGO_DUPLICADO'), host);
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 409,
      error: 'Conflict',
      code: 'INSUMO_CODIGO_DUPLICADO',
      message: 'Já existe',
    });
  });

  it('HttpException com corpo objeto repassa o corpo', () => {
    const { host, response } = criarHost();
    const excecao = new BadRequestException(['campo inválido']);
    filtro.catch(excecao, host);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(excecao.getResponse());
  });

  it('HttpException com corpo string vira { statusCode, message }', () => {
    const { host, response } = criarHost();
    filtro.catch(new HttpException('Bloqueado', 423), host);
    expect(response.status).toHaveBeenCalledWith(423);
    expect(response.json).toHaveBeenCalledWith({ statusCode: 423, message: 'Bloqueado' });
  });

  it('erro desconhecido vira 500 genérico e é logado', () => {
    const { host, response } = criarHost();
    const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      filtro.catch(new Error('boom'), host);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Erro interno do servidor',
    });
  });
});
