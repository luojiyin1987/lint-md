import type { LintMdRule, PositionedTextNode } from '../types.js';
import { TextScanner } from '../utils/text-scanner.js';

const requireTrailingSpaces: LintMdRule = {
  meta: {
    name: 'require-trailing-spaces'
  },
  create(context) {
    return {
      text(node: PositionedTextNode) {
        const scanner = new TextScanner(node, context.sourceCode);
        scanner.forEachMatchIndex(/\r\n|\r|\n/g, (index, length) => {
          const offset = scanner.rangeAt(index, length)[0];
          let trailingSpaces = 0;

          for (
            let candidate = offset - 1;
            candidate >= 0 && context.sourceCode.text[candidate] === ' ';
            candidate--
          ) {
            trailingSpaces++;
          }

          const missingSpaces = Math.max(0, 2 - trailingSpaces);

          if (missingSpaces === 0) {
            return;
          }

          context.report({
            range: [offset, offset],
            message: '软换行前需要两个空格',
            fix: fixer => fixer.insertTextAt(offset, ' '.repeat(missingSpaces))
          });
        });
      }
    };
  }
};

export default requireTrailingSpaces;
