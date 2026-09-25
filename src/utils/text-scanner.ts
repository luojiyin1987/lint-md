import type {
  LintSourceCode,
  PositionedInlineCodeNode,
  PositionedTextNode,
  TextRange
} from '../types.js';
import type { MarkdownTextNode } from './get-text-nodes.js';

export interface TextMatch {
  index: number
  length: number
  absoluteRange: TextRange
}

/**
 * Scans normalized text through the document SourceCode service.
 */
export class TextScanner {
  private readonly _value: string;
  private readonly _node: MarkdownTextNode;
  private readonly _sourceCode: LintSourceCode;

  constructor(node: MarkdownTextNode, sourceCode: LintSourceCode) {
    this._node = node;
    this._value = node.value;
    this._sourceCode = sourceCode;
  }

  get value(): string {
    return this._value;
  }

  get node(): MarkdownTextNode {
    return this._node;
  }

  rangeAt(index: number, length: number): TextRange {
    return this._sourceCode.getTextRange(
      this._node as MarkdownTextNode as PositionedTextNode | PositionedInlineCodeNode,
      index,
      index + length
    );
  }

  matchAt(index: number, length: number): TextMatch {
    const absoluteRange = this.rangeAt(index, length);
    return {
      index,
      length,
      absoluteRange
    };
  }

  forEachMatchIndex(
    regex: RegExp,
    callback: (index: number, length: number) => void
  ): void {
    const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
    let matched = re.exec(this._value);
    while (matched !== null) {
      if (matched[0].length === 0) {
        re.lastIndex++;
      }
      else {
        callback(matched.index, matched[0].length);
      }
      matched = re.exec(this._value);
    }
  }

  forEachOccurrenceIndex(
    searchStr: string,
    callback: (index: number, length: number) => void
  ): void {
    if (!searchStr) {
      return;
    }
    for (let start = 0; start < this._value.length;) {
      const index = this._value.indexOf(searchStr, start);
      if (index === -1) {
        break;
      }
      callback(index, searchStr.length);
      start = index + 1;
    }
  }

  /** Iterates Unicode code points so an atomic two-unit entity is visited once. */
  forEachChar(callback: (char: string, index: number) => void): void {
    for (let index = 0; index < this._value.length;) {
      const char = String.fromCodePoint(this._value.codePointAt(index)!);
      callback(char, index);
      index += char.length;
    }
  }
}
