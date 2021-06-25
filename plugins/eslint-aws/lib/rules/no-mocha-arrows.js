'use strict'
/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
exports.__esModule = true
var MOCHA_EXPRESSIONS = new Set(['after', 'before', 'it', 'describe', 'afterEach', 'beforeEach'])
function isMochaExpression(node, context) {
    // add check for .test file somewhere
    if (node.type !== 'CallExpression') {
        return false
    }
    if (node.callee.type === 'Identifier' && MOCHA_EXPRESSIONS.has(node.callee.name)) {
        node.arguments.forEach(function (arg) {
            if (arg.type === 'ArrowFunctionExpression') {
                var line = arg.loc.start.line
                var bodyLoc = arg.body.loc
                context.report({
                    node: arg,
                    message: arg.type,
                    loc: {
                        start: { line: line, column: arg.loc.start.column },
                        end: { line: line, column: bodyLoc.start.column },
                    },
                })
            }
        })
    }
    return false
}
// https://eslint.org/docs/developer-guide/working-with-rules
var newRule = function (context) {
    return {
        CallExpression: function (node) {
            if (isMochaExpression(node, context)) {
                context.report({
                    node: node,
                    message: 'No arrow functions allowed!',
                    loc: node.loc,
                })
            }
        },
    }
}
exports['default'] = {
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
}
