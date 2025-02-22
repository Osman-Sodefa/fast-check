import fc from '../../../../lib/fast-check';
import prand from 'pure-rand';

import { ArrayArbitrary } from '../../../../src/arbitrary/_internals/ArrayArbitrary';
import { NextValue } from '../../../../src/check/arbitrary/definition/NextValue';
import { MaxLengthUpperBound } from '../../../../src/arbitrary/_internals/helpers/MaxLengthFromMinLength';
import { CustomSet } from '../../../../src/arbitrary/_internals/interfaces/CustomSet';
import { convertFromNextWithShrunkOnce } from '../../../../src/check/arbitrary/definition/Converters';
import { Stream } from '../../../../src/stream/Stream';
import { cloneMethod, hasCloneMethod } from '../../../../src/check/symbols';
import { NextArbitrary } from '../../../../src/check/arbitrary/definition/NextArbitrary';
import { Random } from '../../../../src/random/generator/Random';

import * as IntegerMock from '../../../../src/arbitrary/integer';
import { fakeNextArbitrary } from '../__test-helpers__/NextArbitraryHelpers';
import { fakeRandom } from '../__test-helpers__/RandomHelpers';
import { buildNextShrinkTree, walkTree } from '../__test-helpers__/ShrinkTree';

function beforeEachHook() {
  jest.resetModules();
  jest.restoreAllMocks();
  fc.configureGlobal({ beforeEach: beforeEachHook });
}
beforeEach(beforeEachHook);

describe('ArrayArbitrary', () => {
  describe('generate', () => {
    it('should concat all the generated values together when no set constraints ', () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(fc.anything(), fc.anything())),
          fc.nat(),
          fc.nat(MaxLengthUpperBound),
          fc.nat(MaxLengthUpperBound),
          fc.anything(),
          (generatedValues, seed, aLength, bLength, integerContext) => {
            // Arrange
            const { acceptedValues, instance, generate } = prepareSetBuilderData(generatedValues, false);
            const { minLength, maxGeneratedLength, maxLength } = extractLengths(seed, aLength, bLength, acceptedValues);
            const { instance: integerInstance, generate: generateInteger } = fakeNextArbitrary();
            generateInteger.mockReturnValue(new NextValue(acceptedValues.size, integerContext));
            const integer = jest.spyOn(IntegerMock, 'integer');
            integer.mockImplementation(() => convertFromNextWithShrunkOnce(integerInstance, undefined));
            const { instance: mrng } = fakeRandom();

            // Act
            const arb = new ArrayArbitrary(instance, minLength, maxGeneratedLength, maxLength);
            const g = arb.generate(mrng, undefined);

            // Assert
            expect(g.hasToBeCloned).toBe(false);
            expect(g.value).toEqual([...acceptedValues].map((v) => v.value));
            expect(integer).toHaveBeenCalledTimes(1);
            expect(integer).toHaveBeenCalledWith(minLength, maxGeneratedLength);
            expect(generateInteger).toHaveBeenCalledTimes(1);
            expect(generateInteger).toHaveBeenCalledWith(mrng, undefined);
            expect(generate).toHaveBeenCalledTimes(acceptedValues.size);
            for (const call of generate.mock.calls) {
              expect(call).toEqual([mrng, undefined]);
            }
          }
        )
      );
    });

    it("should not concat all the values together in case they don't follow set contraints", () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(fc.anything(), fc.anything(), fc.boolean())),
          fc.nat(),
          fc.nat(MaxLengthUpperBound),
          fc.nat(MaxLengthUpperBound),
          fc.anything(),
          (generatedValues, seed, aLength, bLength, integerContext) => {
            // Arrange
            const { acceptedValues, instance, generate, setBuilder } = prepareSetBuilderData(generatedValues, false);
            const { minLength, maxGeneratedLength, maxLength } = extractLengths(seed, aLength, bLength, acceptedValues);
            const { instance: integerInstance, generate: generateInteger } = fakeNextArbitrary();
            generateInteger.mockReturnValue(new NextValue(acceptedValues.size, integerContext));
            const integer = jest.spyOn(IntegerMock, 'integer');
            integer.mockImplementation(() => convertFromNextWithShrunkOnce(integerInstance, undefined));
            const { instance: mrng } = fakeRandom();

            // Act
            const arb = new ArrayArbitrary(instance, minLength, maxGeneratedLength, maxLength, setBuilder);
            const g = arb.generate(mrng, undefined);

            // Assert
            expect(g.hasToBeCloned).toBe(false);
            // In the case of set the generated value might be smaller
            // The generator is allowed to stop whenever it considers at already tried to many times (maxGeneratedLength times)
            expect(g.value).toEqual([...acceptedValues].map((v) => v.value).slice(0, g.value.length));
            expect(integer).toHaveBeenCalledTimes(1);
            expect(integer).toHaveBeenCalledWith(minLength, maxGeneratedLength);
            expect(generateInteger).toHaveBeenCalledTimes(1);
            expect(generateInteger).toHaveBeenCalledWith(mrng, undefined);
            expect(setBuilder).toHaveBeenCalledTimes(1);
            for (const call of generate.mock.calls) {
              expect(call).toEqual([mrng, undefined]);
            }
          }
        )
      );
    });

    it("should always pass bias to values' arbitrary when minLength equals maxGeneratedLength", () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(fc.anything(), fc.anything(), fc.boolean())),
          fc.nat(),
          fc.nat(MaxLengthUpperBound),
          fc.anything(),
          fc.integer({ min: 2 }),
          fc.boolean(),
          (generatedValues, seed, aLength, integerContext, biasFactor, withSetBuilder) => {
            // Arrange
            const { acceptedValues, instance, setBuilder, generate } = prepareSetBuilderData(
              generatedValues,
              !withSetBuilder
            );
            const { minLength, maxLength } = extractLengths(seed, aLength, aLength, acceptedValues);
            const { instance: integerInstance, generate: generateInteger } = fakeNextArbitrary();
            generateInteger.mockReturnValue(new NextValue(minLength, integerContext));
            const integer = jest.spyOn(IntegerMock, 'integer');
            integer.mockImplementation(() => convertFromNextWithShrunkOnce(integerInstance, undefined));
            const { instance: mrng } = fakeRandom();

            // Act
            const arb = new ArrayArbitrary(
              instance,
              minLength,
              minLength,
              maxLength,
              withSetBuilder ? setBuilder : undefined
            );
            const g = arb.generate(mrng, biasFactor);

            // Assert
            expect(g.hasToBeCloned).toBe(false);
            if (!withSetBuilder) {
              // In the case of set the generated value might be smaller
              // The generator is allowed to stop whenever it considers at already tried to many times (maxGeneratedLength times)
              expect(g.value).toEqual([...acceptedValues].map((v) => v.value).slice(0, minLength));
            } else {
              expect(g.value).toEqual(
                [...acceptedValues].map((v) => v.value).slice(0, Math.min(g.value.length, minLength))
              );
            }
            expect(integer).toHaveBeenCalledTimes(1);
            expect(integer).toHaveBeenCalledWith(minLength, minLength);
            expect(generateInteger).toHaveBeenCalledTimes(1);
            expect(generateInteger).toHaveBeenCalledWith(mrng, undefined); // no need to bias it
            expect(setBuilder).toHaveBeenCalledTimes(withSetBuilder ? 1 : 0);
            expect(generate.mock.calls.length).toBeGreaterThanOrEqual(minLength);
            for (const call of generate.mock.calls) {
              expect(call).toEqual([mrng, biasFactor]); // but bias all sub-values
            }
          }
        )
      );
    });

    it('should produce a cloneable instance if provided one cloneable underlying', () => {
      // Arrange
      const { instance, generate } = fakeNextArbitrary<string[]>();
      generate
        .mockReturnValueOnce(new NextValue(['a'], undefined))
        .mockReturnValueOnce(new NextValue(Object.defineProperty(['b'], cloneMethod, { value: jest.fn() }), undefined))
        .mockReturnValueOnce(new NextValue(['c'], undefined))
        .mockReturnValueOnce(new NextValue(['d'], undefined));
      const { instance: integerInstance, generate: generateInteger } = fakeNextArbitrary();
      generateInteger.mockReturnValue(new NextValue(4, undefined));
      const integer = jest.spyOn(IntegerMock, 'integer');
      integer.mockImplementation(() => convertFromNextWithShrunkOnce(integerInstance, undefined));
      const { instance: mrng } = fakeRandom();

      // Act
      const arb = new ArrayArbitrary(instance, 0, 10, 100);
      const g = arb.generate(mrng, undefined);

      // Assert
      expect(g.hasToBeCloned).toBe(true);
      expect(hasCloneMethod(g.value)).toBe(true);
      expect(g.value_).not.toEqual([['a'], ['b'], ['c'], ['d']]); // 2nd item is not just ['b']
      expect(g.value_.map((v) => [...v])).toEqual([['a'], ['b'], ['c'], ['d']]);
    });

    it('should not clone cloneable on generate', () => {
      // Arrange
      const cloneMethodImpl = jest.fn();
      const { instance, generate } = fakeNextArbitrary<string[]>();
      generate
        .mockReturnValueOnce(new NextValue(['a'], undefined))
        .mockReturnValueOnce(
          new NextValue(Object.defineProperty(['b'], cloneMethod, { value: cloneMethodImpl }), undefined)
        )
        .mockReturnValueOnce(new NextValue(['c'], undefined))
        .mockReturnValueOnce(new NextValue(['d'], undefined));
      const { instance: integerInstance, generate: generateInteger } = fakeNextArbitrary();
      generateInteger.mockReturnValue(new NextValue(4, undefined));
      const integer = jest.spyOn(IntegerMock, 'integer');
      integer.mockImplementation(() => convertFromNextWithShrunkOnce(integerInstance, undefined));
      const { instance: mrng } = fakeRandom();

      // Act
      const arb = new ArrayArbitrary(instance, 0, 10, 100);
      const g = arb.generate(mrng, undefined);

      // Assert
      expect(cloneMethodImpl).not.toHaveBeenCalled();
      g.value; // not calling clone as this is the first access
      expect(cloneMethodImpl).not.toHaveBeenCalled();
      g.value; // calling clone as this is the second access
      expect(cloneMethodImpl).toHaveBeenCalledTimes(1);
      g.value; // calling clone (again) as this is the third access
      expect(cloneMethodImpl).toHaveBeenCalledTimes(2);
      g.value_; // not calling clone as we access value_ not value
      expect(cloneMethodImpl).toHaveBeenCalledTimes(2);
    });
  });

  describe('canShrinkWithoutContext', () => {
    it('should reject any array not matching the requirements on length', () => {
      fc.assert(
        fc.property(
          fc.array(fc.anything()),
          fc.boolean(),
          fc.nat(MaxLengthUpperBound),
          fc.nat(MaxLengthUpperBound),
          fc.nat(MaxLengthUpperBound),
          (value, withSetBuilder, aLength, bLength, cLength) => {
            // Arrange
            const [minLength, maxGeneratedLength, maxLength] = [aLength, bLength, cLength].sort((a, b) => a - b);
            fc.pre(value.length < minLength || value.length > maxLength);
            const { instance, canShrinkWithoutContext } = fakeNextArbitrary();
            const data: any[] = [];
            const customSet: CustomSet<NextValue<any>> = {
              size: () => data.length,
              getData: () => data,
              tryAdd: (vTest) => {
                data.push(vTest.value_);
                return true;
              },
            };
            const setBuilder = jest.fn();
            setBuilder.mockReturnValue(customSet);

            // Act
            const arb = new ArrayArbitrary(
              instance,
              minLength,
              maxGeneratedLength,
              maxLength,
              withSetBuilder ? setBuilder : undefined
            );
            const out = arb.canShrinkWithoutContext(value);

            // Assert
            expect(out).toBe(false);
            expect(canShrinkWithoutContext).not.toHaveBeenCalled();
            expect(setBuilder).not.toHaveBeenCalled();
          }
        )
      );
    });

    it('should reject any array with at least one entry rejected by the sub-arbitrary', () => {
      fc.assert(
        fc.property(
          fc.set(fc.tuple(fc.anything(), fc.boolean()), {
            minLength: 1,
            compare: { selector: (v) => v[0], type: 'SameValue' },
          }),
          fc.boolean(),
          fc.nat(MaxLengthUpperBound),
          fc.nat(MaxLengthUpperBound),
          fc.nat(MaxLengthUpperBound),
          (value, withSetBuilder, offsetMin, offsetMax, maxGeneratedLength) => {
            // Arrange
            fc.pre(value.some((v) => !v[1]));
            const minLength = Math.min(Math.max(0, value.length - offsetMin), maxGeneratedLength);
            const maxLength = Math.max(Math.min(MaxLengthUpperBound, value.length + offsetMax), maxGeneratedLength);
            const { instance, canShrinkWithoutContext } = fakeNextArbitrary();
            canShrinkWithoutContext.mockImplementation((vTest) => value.find((v) => Object.is(v[0], vTest))![1]);
            const data: any[] = [];
            const customSet: CustomSet<NextValue<any>> = {
              size: () => data.length,
              getData: () => data,
              tryAdd: (vTest) => {
                data.push(vTest.value_);
                return true;
              },
            };
            const setBuilder = jest.fn();
            setBuilder.mockReturnValue(customSet);

            // Act
            const arb = new ArrayArbitrary(
              instance,
              minLength,
              maxGeneratedLength,
              maxLength,
              withSetBuilder ? setBuilder : undefined
            );
            const out = arb.canShrinkWithoutContext(value.map((v) => v[0]));

            // Assert
            expect(out).toBe(false);
            expect(canShrinkWithoutContext).toHaveBeenCalled();
          }
        )
      );
    });

    it('should reject any array not matching requirements for set constraints', () => {
      fc.assert(
        fc.property(
          fc.set(fc.tuple(fc.anything(), fc.boolean()), {
            minLength: 1,
            compare: { selector: (v) => v[0], type: 'SameValue' },
          }),
          fc.nat(MaxLengthUpperBound),
          fc.nat(MaxLengthUpperBound),
          fc.nat(MaxLengthUpperBound),
          (value, offsetMin, offsetMax, maxGeneratedLength) => {
            // Arrange
            fc.pre(value.some((v) => !v[1]));
            const minLength = Math.min(Math.max(0, value.length - offsetMin), maxGeneratedLength);
            const maxLength = Math.max(Math.min(MaxLengthUpperBound, value.length + offsetMax), maxGeneratedLength);
            const { instance, canShrinkWithoutContext } = fakeNextArbitrary();
            canShrinkWithoutContext.mockReturnValue(true);
            const data: any[] = [];
            const customSet: CustomSet<NextValue<any>> = {
              size: () => data.length,
              getData: () => data,
              tryAdd: (vTest) => {
                if (value.find((v) => Object.is(v[0], vTest.value_))![1]) {
                  data.push(vTest.value_);
                  return true;
                }
                return false;
              },
            };
            const setBuilder = jest.fn();
            setBuilder.mockReturnValue(customSet);

            // Act
            const arb = new ArrayArbitrary(instance, minLength, maxGeneratedLength, maxLength, setBuilder);
            const out = arb.canShrinkWithoutContext(value.map((v) => v[0]));

            // Assert
            expect(out).toBe(false);
            expect(canShrinkWithoutContext).toHaveBeenCalled();
            expect(setBuilder).toHaveBeenCalled();
          }
        )
      );
    });

    it('should reject any sparse array', () => {
      fc.assert(
        fc.property(
          fc.sparseArray(fc.anything()),
          fc.boolean(),
          fc.nat(MaxLengthUpperBound),
          fc.nat(MaxLengthUpperBound),
          fc.nat(MaxLengthUpperBound),
          (value, withSetBuilder, offsetMin, offsetMax, maxGeneratedLength) => {
            // Arrange
            fc.pre(value.length !== Object.keys(value).length);
            const minLength = Math.min(Math.max(0, value.length - offsetMin), maxGeneratedLength);
            const maxLength = Math.max(Math.min(MaxLengthUpperBound, value.length + offsetMax), maxGeneratedLength);
            const { instance, canShrinkWithoutContext } = fakeNextArbitrary();
            canShrinkWithoutContext.mockReturnValue(true);
            const data: any[] = [];
            const customSet: CustomSet<NextValue<any>> = {
              size: () => data.length,
              getData: () => data,
              tryAdd: (vTest) => {
                data.push(vTest.value_);
                return true;
              },
            };
            const setBuilder = jest.fn();
            setBuilder.mockReturnValue(customSet);

            // Act
            const arb = new ArrayArbitrary(
              instance,
              minLength,
              maxGeneratedLength,
              maxLength,
              withSetBuilder ? setBuilder : undefined
            );
            const out = arb.canShrinkWithoutContext(value);

            // Assert
            expect(out).toBe(false);
          }
        )
      );
    });

    it('should accept all other arrays', () => {
      fc.assert(
        fc.property(
          fc.array(fc.anything()),
          fc.boolean(),
          fc.nat(MaxLengthUpperBound),
          fc.nat(MaxLengthUpperBound),
          fc.nat(MaxLengthUpperBound),
          (value, withSetBuilder, offsetMin, offsetMax, maxGeneratedLength) => {
            // Arrange
            const minLength = Math.min(Math.max(0, value.length - offsetMin), maxGeneratedLength);
            const maxLength = Math.max(Math.min(MaxLengthUpperBound, value.length + offsetMax), maxGeneratedLength);
            const { instance, canShrinkWithoutContext } = fakeNextArbitrary();
            canShrinkWithoutContext.mockReturnValue(true);
            const data: any[] = [];
            const customSet: CustomSet<NextValue<any>> = {
              size: () => data.length,
              getData: () => data,
              tryAdd: (vTest) => {
                data.push(vTest.value_);
                return true;
              },
            };
            const setBuilder = jest.fn();
            setBuilder.mockReturnValue(customSet);

            // Act
            const arb = new ArrayArbitrary(
              instance,
              minLength,
              maxGeneratedLength,
              maxLength,
              withSetBuilder ? setBuilder : undefined
            );
            const out = arb.canShrinkWithoutContext(value);

            // Assert
            expect(out).toBe(true);
          }
        )
      );
    });
  });
});

describe('ArrayArbitrary (integration)', () => {
  it('should not re-use twice the same instance of cloneable', () => {
    // Arrange
    const alreadySeenCloneable = new Set<unknown>();
    const mrng = new Random(prand.mersenne(0));
    const arb = new ArrayArbitrary(new CloneableArbitrary(), 0, 5, 100); // 0 to 5 generated items

    // Act
    let g = arb.generate(mrng, undefined);
    while (g.value.length !== 3) {
      // 3 allows to shrink something large enough but not too large
      // walking through the tree when >3 takes much longer
      g = arb.generate(mrng, undefined);
    }
    const treeA = buildNextShrinkTree(arb, g);
    const treeB = buildNextShrinkTree(arb, g);

    // Assert
    walkTree(treeA, (cloneable) => {
      expect(alreadySeenCloneable.has(cloneable)).toBe(false);
      alreadySeenCloneable.add(cloneable);
      for (const subCloneable of cloneable) {
        expect(alreadySeenCloneable.has(subCloneable)).toBe(false);
        alreadySeenCloneable.add(subCloneable);
      }
    });
    walkTree(treeB, (cloneable) => {
      expect(alreadySeenCloneable.has(cloneable)).toBe(false);
      alreadySeenCloneable.add(cloneable);
      for (const subCloneable of cloneable) {
        expect(alreadySeenCloneable.has(subCloneable)).toBe(false);
        alreadySeenCloneable.add(subCloneable);
      }
    });
  });
});

// Helpers

function prepareSetBuilderData(generatedValues: [value: any, context: any, rejected?: boolean][], acceptAll: boolean) {
  const acceptedValues = new Set<NextValue<any>>();
  const { instance, generate } = fakeNextArbitrary();
  for (const v of generatedValues) {
    const value = new NextValue(v[0], v[1]);
    const rejected = v[2];
    if (!rejected || acceptAll) {
      acceptedValues.add(value);
    }
    generate.mockReturnValueOnce(value);
  }
  const data: any[] = [];
  const customSet: CustomSet<NextValue<any>> = {
    size: () => data.length,
    getData: () => data,
    tryAdd: (value) => {
      if (acceptedValues.has(value)) {
        data.push(value);
        return true;
      }
      return false;
    },
  };
  const setBuilder = jest.fn();
  setBuilder.mockReturnValue(customSet);
  return { acceptedValues, instance, generate, setBuilder };
}

function extractLengths(minLengthSeed: number, aLength: number, bLength: number, acceptedValues: Set<unknown>) {
  const minLength = minLengthSeed % (acceptedValues.size || 1);
  const [maxGeneratedLength, maxLength] = aLength < bLength ? [aLength, bLength] : [bLength, aLength];
  fc.pre(maxGeneratedLength >= acceptedValues.size);
  return { minLength, maxGeneratedLength, maxLength };
}

class CloneableArbitrary extends NextArbitrary<number[]> {
  private instance() {
    return Object.defineProperty([], cloneMethod, { value: () => this.instance() });
  }
  generate(_mrng: Random): NextValue<number[]> {
    return new NextValue(this.instance(), { shrunkOnce: false });
  }
  canShrinkWithoutContext(_value: unknown): _value is number[] {
    throw new Error('No call expected in that scenario');
  }
  shrink(value: number[], context?: unknown): Stream<NextValue<number[]>> {
    if (typeof context !== 'object' || context === null || !('shrunkOnce' in context)) {
      throw new Error('Invalid context for CloneableArbitrary');
    }
    const safeContext = context as { shrunkOnce: boolean };
    if (safeContext.shrunkOnce) {
      return Stream.nil();
    }
    return Stream.of(new NextValue(this.instance(), { shrunkOnce: true }));
  }
}
