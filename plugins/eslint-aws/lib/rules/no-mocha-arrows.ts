/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as eslint from 'eslint'

const MOCHA_EXPRESSIONS = new Set(['after', 'before', 'it', 'describe', 'afterEach', 'beforeEach'])

function isMochaExpression(node: eslint.Rule.Node, context: eslint.Rule.RuleContext): boolean {
    // add check for .test file somewhere
    if (node.type !== 'CallExpression') {
        return false
    }

    if (node.callee.type === 'Identifier' && MOCHA_EXPRESSIONS.has(node.callee.name)) {
        node.arguments.forEach(arg => {
            if (arg.type === 'ArrowFunctionExpression') {
                const line = arg.loc!.start.line
                const bodyLoc = arg.body.loc!

                context.report({
                    node: arg,
                    message: arg.type,
                    loc: {
                        start: { line, column: arg.loc!.start.column },
                        end: { line, column: bodyLoc.start.column },
                    },
                })
            }
        })
    }

    return false
}

// https://eslint.org/docs/developer-guide/working-with-rules
const newRule = function (context: eslint.Rule.RuleContext) {
    return {
        CallExpression: function (node: eslint.Rule.Node) {
            if (isMochaExpression(node, context)) {
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
