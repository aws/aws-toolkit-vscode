/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as eslint from 'eslint'

const REPLACE_AWS_FUNCTION = 'getIdeProperties().company'

type CallExpressionNode = eslint.Rule.Node & { type: 'CallExpression' }

interface ArgsShift {
    start: number
    end: number
    index: number
}

function applyOffset(range: eslint.AST.Range, offset: number): eslint.AST.Range {
    return [range[0] + offset, range[1] + offset]
}

function shiftLocalizeArgs(text: string, matches: RegExpMatchArray): ArgsShift[] {
    const shifts: ArgsShift[] = []

    matches.forEach((match, index) => {
        const startPos = text.indexOf(match)
        shifts.push({ start: startPos + 1, end: startPos + 4, index })
    })

    return shifts
}

function isLocalizeCall(node: eslint.Rule.Node): node is CallExpressionNode {
    return (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'localize' &&
        node.arguments.length > 1
    )
}

function checkLocalize(node: eslint.Rule.Node, context: eslint.Rule.RuleContext): void {
    if (isLocalizeCall(node)) {
        const secondArg = node.arguments[1]

        if (secondArg.type !== 'Literal' || typeof secondArg.value !== 'string') {
            return
        }

        const text = secondArg.value

        const index = text.search('AWS')
        const lastIndex = text.lastIndexOf('AWS')

        if (index === -1) {
            return
        }

        const range = secondArg.range!
        const line = secondArg.loc!.start.line
        const col = secondArg.loc!.start.column

        const matches = text.match(/\{[0-9]+\}/g) ?? []

        if (matches.length > node.arguments.length - 2) {
            return
        }

        let start = 0

        while (start < matches.length && text.indexOf(matches[start]) < index && ++start) {}

        context.report({
            message: 'No "AWS" in localize calls',
            node,
            loc: {
                start: { line, column: col + index + 1 },
                end: { line, column: col + lastIndex + 4 },
            },
            fix: fixer => {
                const fixes: eslint.Rule.Fix[] = []

                for (let i = index; i >= 0; i = text.indexOf('AWS', i + 1)) {
                    fixes.push(fixer.replaceTextRange(applyOffset([1, 4], range[0] + i), `{${start}}`))
                }

                shiftLocalizeArgs(text, matches!.slice(start)).forEach(shift => {
                    fixes.push(
                        fixer.replaceTextRange(
                            applyOffset([shift.start, shift.end], range[0]),
                            `{${start + shift.index + 1}}`
                        )
                    )
                })

                const source = context.getSourceCode()
                const prevToken = start === 0 ? node : node.arguments[start - 1]
                const prevArg = node.arguments[start]
                const indent =
                    prevArg.loc!.start.line !== prevToken.loc!.start.line
                        ? `\n${source.text.slice(prevArg.range![0] - prevArg.loc!.start.column, prevArg.range![0])}`
                        : ' '
                fixes.push(fixer.insertTextAfter(node.arguments[start + 1], `,${indent}${REPLACE_AWS_FUNCTION}`))

                return fixes
            },
        })
    }
}

const rule = function (context: eslint.Rule.RuleContext) {
    return {
        CallExpression: node => checkLocalize(node, context),
    } as eslint.Rule.RuleListener
}

export default {
    meta: {
        type: 'problem',
        fixable: 'code',
        docs: {
            description: 'no arrows',
            category: 'Stylistic Issues',
            recommended: true,
            url: 'https://eslint.org/docs/rules/array-bracket-spacing',
        },
    },
    create: rule,
} as eslint.Rule.RuleModule
