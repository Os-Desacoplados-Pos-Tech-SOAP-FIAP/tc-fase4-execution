import { Type } from 'class-transformer';
import { IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

import { MensagemInvalidaError } from './message-envelope.parser';
import { validarPayload } from './validar-payload';

class Item {
  @IsUUID() itemId!: string;
  @IsInt() @Min(1) quantidade!: number;
}
class Payload {
  @IsArray() @ValidateNested({ each: true }) @Type(() => Item) itens!: Item[];
}

describe('validarPayload', () => {
  it('devolve a instância tipada quando válido', async () => {
    const p = await validarPayload(Payload, {
      itens: [{ itemId: '11111111-1111-4111-8111-111111111111', quantidade: 2 }],
    });
    expect(p.itens[0]).toBeInstanceOf(Item);
  });

  it('lança MensagemInvalidaError quando inválido', async () => {
    await expect(validarPayload(Payload, { itens: [{ itemId: 'x', quantidade: 0 }] })).rejects.toBeInstanceOf(
      MensagemInvalidaError,
    );
  });
});
