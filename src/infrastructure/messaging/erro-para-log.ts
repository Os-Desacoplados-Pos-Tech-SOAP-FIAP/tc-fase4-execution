/** Só nome e mensagem: o objeto de erro inteiro pode carregar request/credenciais do SDK. */
export function erroParaLog(erro: unknown): { message: string; name: string } {
  if (erro instanceof Error) return { message: erro.message, name: erro.name };
  return { message: String(erro), name: 'Error' };
}
