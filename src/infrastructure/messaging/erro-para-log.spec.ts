import { erroParaLog } from './erro-para-log';

describe('erroParaLog', () => {
  it('extrai só nome e mensagem de um Error', () => {
    const erro = Object.assign(new TypeError('falhou'), { $metadata: { requestId: 'x' } });
    expect(erroParaLog(erro)).toEqual({ message: 'falhou', name: 'TypeError' });
  });

  it('valor lançado que não é Error vira mensagem textual', () => {
    expect(erroParaLog('texto')).toEqual({ message: 'texto', name: 'Error' });
    expect(erroParaLog(null)).toEqual({ message: 'null', name: 'Error' });
  });
});
