import type { LintMdRule, PositionedTextNode } from '../types.js';
import { TextScanner } from '../utils/text-scanner.js';

// U+0008 (backspace) and U+200A (hair space)
const SPECIAL_CHARACTERS = ['\u0008', '\u200A'];

const noSpecialCharacters: LintMdRule = {
  meta: {
    name: 'no-special-characters'
  },
  create: (context) => {
    return {
      text: (node: PositionedTextNode) => {
        const scanner = new TextScanner(node, context.sourceCode);

        SPECIAL_CHARACTERS.forEach((sc) => {
          scanner.forEachOccurrenceIndex(sc, (index, length) => {
            const range = scanner.rangeAt(index, length);
            context.report({
              range,
              message: '文本中不能包含特殊字符，请删除或者替换',
              fix: fixer => fixer.removeRange(range)
            });
          });
        });
      }
    };
  }
};

export default noSpecialCharacters;
