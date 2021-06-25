/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as eslint from 'eslint'

function hasLocalizeAws(node: eslint.Rule.Node, context: eslint.Rule.RuleContext): boolean {
    if (node.type !== 'CallExpression') {
        return false
    }

    if (node.callee.type === 'Identifier' && node.callee.name === 'localize') {
        if (node.arguments.length < 2) {
            return false
        }
        const secondArg = node.arguments[1]

        if (secondArg.type === 'Literal') {
            const val = secondArg.value

            if (typeof val === 'string') {
                const index = val.search('AWS')
                const loc = secondArg.loc!
                const range = secondArg.range!
                const line = loc.start.line
                const col = loc.start.column

                if (index !== -1) {
                    const matches = val.match(/\{[0-9]+\}/g)
                    let start = 0
                    while (matches && start < matches.length && val.indexOf(matches[start]) < index) {
                        start++
                    }

                    context.report({
                        message: 'No AWS in localize calls',
                        node,
                        loc: {
                            start: { line, column: col + index + 1 },
                            end: { line, column: col + index + 4 },
                        },
                        fix: fixer => {
                            const fixes: eslint.Rule.Fix[] = []
                            fixes.push(
                                fixer.replaceTextRange([range[0] + index + 1, range[0] + index + 4], `{${start}}`)
                            )

                            const targetArg = start + 2

                            while (matches && start < matches?.length) {
                                const index2 = val.indexOf(matches[start])
                                fixes.push(
                                    fixer.replaceTextRange(
                                        [range[0] + index2 + 1, range[0] + index2 + 4],
                                        `{${++start}}`
                                    )
                                )
                            }

                            fixes.push(
                                fixer.insertTextAfter(node.arguments[targetArg - 1], ',\ngetIdeProperties().company')
                            )

                            return fixes
                        },
                    })
                }
            }
        }
    }

    return false
}

// https://eslint.org/docs/developer-guide/working-with-rules
const newRule = function (context: eslint.Rule.RuleContext) {
    return {
        CallExpression: function (node: eslint.Rule.Node) {
            if (hasLocalizeAws(node, context)) {
                context.report({
                    node: node,
                    message: 'No arrow functions allowed!',
                    loc: node.loc as any,
                })
            }
        },
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
    create: newRule,
} as eslint.Rule.RuleModule
