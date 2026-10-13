import { ValueObject } from './ValueObject';

class TestVO extends ValueObject<{ x: number }> {
  static create(x: number) {
    return new TestVO({ x });
  }
}

describe('ValueObject', () => {
  it('equals retorna false quando comparado com undefined', () => {
    const vo = TestVO.create(1);
    expect(vo.equals(undefined)).toBe(false);
  });

  it('equals retorna true quando props são iguais', () => {
    const a = TestVO.create(1);
    const b = TestVO.create(1);
    expect(a.equals(b)).toBe(true);
  });

  it('equals retorna false quando props diferem', () => {
    const a = TestVO.create(1);
    const b = TestVO.create(2);
    expect(a.equals(b)).toBe(false);
  });
});
