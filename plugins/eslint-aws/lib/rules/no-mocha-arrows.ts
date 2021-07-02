/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as eslint from 'eslint'

const MOCHA_EXPRESSIONS = new Set(['after', 'before', 'it', 'describe', 'afterEach', 'beforeEach'])

type ArrowNode = eslint.Rule.Node & { type: 'ArrowFunctionExpression' }

function getArrow(node: eslint.Rule.Node): ArrowNode | undefined {
    if (node.type !== 'CallExpression') {
        return undefined
    }

    if (node.callee.type === 'Identifier' && MOCHA_EXPRESSIONS.has(node.callee.name)) {
        return <any>node.arguments.find(arg => arg.type === 'ArrowFunctionExpression')
    }
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
                    // need to implement this
                    //fix: fixer => fixArrow(arrow, fixer, context.getSourceCode()),
                })
            }
        },
    } as eslint.Rule.RuleListener
}

export default {
    meta: {
        type: 'problem',
        //fixable: 'code',
        docs: {
            description: 'no arrows',
            category: 'Stylistic Issues',
            recommended: true,
            url: 'https://mochajs.org/#arrow-functions',
        },
    },
    create: newRule,
} as eslint.Rule.RuleModule
