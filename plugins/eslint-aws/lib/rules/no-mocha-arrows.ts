/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as eslint from 'eslint'

const MOCHA_EXPRESSIONS = new Set(['after', 'before', 'it', 'describe', 'afterEach', 'beforeEach'])

function getArrow(node: eslint.Rule.Node): eslint.Rule.Node | undefined {
    if (node.type !== 'CallExpression') {
        return undefined
    }

    if (node.callee.type === 'Identifier' && MOCHA_EXPRESSIONS.has(node.callee.name)) {
        return <any>node.arguments.find(arg => arg.type === 'ArrowFunctionExpression')
    }
}

function fixArrow(node: eslint.Rule.Node, fixer: eslint.Rule.RuleFixer): eslint.Rule.Fix[] {
    if (node.type !== 'ArrowFunctionExpression') {
        return []
    }

    const bodyStart = node.body.range![0]
    const paramsStart = node.params.length > 0 ? node.params[0].range![0] : 0
    const paramsEnd = node.params.length > 0 ? node.params[0].range![1] : 1
    const fixes: eslint.Rule.Fix[] = []

    fixes.push(fixer.removeRange([paramsEnd + 1, bodyStart - 1]))
    fixes.push(fixer.replaceTextRange([0, paramsStart - 1], `${node.async ? 'async' : ''} function `))

    return fixes
}

// https://eslint.org/docs/developer-guide/working-with-rules
const newRule = function (context: eslint.Rule.RuleContext) {
    return {
        CallExpression: function (node: eslint.Rule.Node) {
            const arrow = getArrow(node)

            if (arrow !== undefined && arrow.type === 'ArrowFunctionExpression') {
                const line = arrow.loc!.start.line
                const bodyLoc = arrow.body.loc!

                context.report({
                    node: arrow,
                    loc: {
                        start: { line, column: arrow.loc!.start.column },
                        end: { line, column: bodyLoc.start.column },
                    },
                    message: 'Arrow functions are not allowed',
                    fix: fixer => fixArrow(arrow, fixer),
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
