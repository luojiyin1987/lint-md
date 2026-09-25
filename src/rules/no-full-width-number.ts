import type { LintMdRule, PositionedTextNode } from '../types.js';
import { TextScanner } from '../utils/text-scanner.js';

const FULL_WIDTH_NUMBER_REPLACEMENT_MAP: Record<string, string> = {
  '１': '1',
  '２': '2',
  '３': '3',
  '４': '4',
  '５': '5',
  '６': '6',
  '７': '7',
  '８': '8',
  '９': '9',
  '０': '0'
};

const noFullWidthNumber: LintMdRule = {
  meta: {
    name: 'no-full-width-number'
  },
  create: (context) => {
    return {
      text: (node: PositionedTextNode) => {
        const scanner = new TextScanner(node, context.sourceCode);
        scanner.forEachMatchIndex(/[０-９]+/g, (index, length) => {
          const range = scanner.rangeAt(index, length);
          const replacement = scanner.value.slice(index, index + length)
            .split('')
            .map(c => FULL_WIDTH_NUMBER_REPLACEMENT_MAP[c])
            .join('');

          context.report({
            range,
            message: '不能用全角数字，请使用半角数字',
            fix: fixer => fixer.replaceTextRange(range, replacement)
          });
        });
      }
    };
  }
};

export default noFullWidthNumber;
