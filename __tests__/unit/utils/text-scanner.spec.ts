import { parseMdWithSourceMap } from '@lint-md/parser';
import { TextScanner } from '../../../src/utils/text-scanner';
import { createLintSourceCode } from '../../../src/utils/source-code';
import { InvalidRuleRangeError } from '../../../src/utils/source-code-errors';
import type { PositionedTextNode } from '../../../src/types';

const createScanner = (markdown: string): TextScanner => {
  const { ast, sourceMap } = parseMdWithSourceMap(markdown);
  const parent = ast.children[0] as { children: PositionedTextNode[] };
  const node = parent.children[0];
  const sourceCode = createLintSourceCode({ text: markdown, ast, sourceMap });
  return new TextScanner(node, sourceCode);
};

describe('TextScanner', () => {
  describe('constructor and getters', () => {
    it('exposes the normalized value and source node', () => {
      const scanner = createScanner('hello');

      expect(scanner.value).toBe('hello');
      expect(scanner.node.value).toBe('hello');
    });
  });

  describe('matchAt', () => {
    it('resolves a simple text range', () => {
      const match = createScanner('hello world').matchAt(0, 5);

      expect(match).toEqual({
        index: 0,
        length: 5,
        absoluteRange: [0, 5]
      });
    });

    it('resolves an empty range at the value end', () => {
      const match = createScanner('hello').matchAt(5, 0);

      expect(match.absoluteRange).toEqual([5, 5]);
    });

    it('resolves a range across line endings', () => {
      const match = createScanner('a\nb\nc').matchAt(0, 3);

      expect(match.absoluteRange).toEqual([0, 3]);
    });

    it('uses the source node start position', () => {
      const match = createScanner('# abc').matchAt(0, 3);

      expect(match.absoluteRange).toEqual([2, 5]);
    });

    it('resolves CRLF positions from SourceCode', () => {
      const match = createScanner('a\r\nb').matchAt(0, 4);

      expect(match.absoluteRange).toEqual([0, 4]);
    });

    it.each([
      [-1, 1],
      [2, -1],
      [1, 10],
      [0.5, 1]
    ])('rejects an invalid range at index %s with length %s', (index, length) => {
      expect(() => createScanner('abc').matchAt(index, length))
        .toThrow(InvalidRuleRangeError);
    });
  });

  describe('forEachMatchIndex', () => {
    it('visits all matches with a global flag', () => {
      const matches: [number, number][] = [];
      createScanner('hello world hello')
        .forEachMatchIndex(/hello/g, (index, length) => matches.push([index, length]));

      expect(matches).toEqual([[0, 5], [12, 5]]);
    });

    it('adds the global flag when it is absent', () => {
      const matches: number[] = [];
      createScanner('hello world hello')
        .forEachMatchIndex(/hello/, index => matches.push(index));

      expect(matches).toHaveLength(2);
    });

    it('ignores zero-length matches', () => {
      const matches: number[] = [];
      createScanner('abc').forEachMatchIndex(/(\b)/g, index => matches.push(index));

      expect(matches).toEqual([]);
    });

    it('does not visit an absent value', () => {
      const callback = jest.fn();
      createScanner('hello').forEachMatchIndex(/xyz/g, callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it('does not map matches before the callback requests them', () => {
      const scanner = createScanner('aaa');
      const rangeAt = jest.spyOn(scanner, 'rangeAt');

      scanner.forEachMatchIndex(/a/g, () => {});

      expect(rangeAt).not.toHaveBeenCalled();
    });
  });

  describe('forEachOccurrenceIndex', () => {
    it('visits all occurrences', () => {
      const matches: [number, number][] = [];
      createScanner('aXaXa')
        .forEachOccurrenceIndex('X', (index, length) => matches.push([index, length]));

      expect(matches).toEqual([[1, 1], [3, 1]]);
    });

    it('visits overlapping occurrences', () => {
      const matches: number[] = [];
      createScanner('aaa')
        .forEachOccurrenceIndex('aa', index => matches.push(index));

      expect(matches).toEqual([0, 1]);
    });

    it('does not visit an empty search string', () => {
      const callback = jest.fn();
      createScanner('hello').forEachOccurrenceIndex('', callback);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('forEachChar', () => {
    it('iterates through Unicode code points', () => {
      const chars: string[] = [];

      createScanner('a𝔄b').forEachChar(char => chars.push(char));

      expect(chars).toEqual(['a', '𝔄', 'b']);
    });

    it('passes only the character and UTF-16 index', () => {
      const callbackArguments: unknown[][] = [];

      createScanner('中𝔄a').forEachChar((...args) => callbackArguments.push(args));

      expect(callbackArguments).toEqual([
        ['中', 0],
        ['𝔄', 1],
        ['a', 3]
      ]);
    });
  });
});
