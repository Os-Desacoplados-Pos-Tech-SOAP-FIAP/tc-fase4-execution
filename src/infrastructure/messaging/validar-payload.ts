import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { MensagemInvalidaError } from './message-envelope.parser';

/** Valida só os campos que este serviço lê (tolerant reader). */
export async function validarPayload<T extends object>(
  classe: new () => T,
  payload: unknown,
): Promise<T> {
  const instancia = plainToInstance(classe, payload);
  const erros = await validate(instancia);
  if (erros.length > 0) {
    throw new MensagemInvalidaError(erros.map((erro) => erro.property).join(', '));
  }
  return instancia;
}
