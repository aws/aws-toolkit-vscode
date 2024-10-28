/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils'
import { Rule } from 'eslint'

export const errMsg = 'Avoid using JSON.stringify within logging and error messages, prefer %O.'

/**
 * Check if a given expression is a JSON.stringify call.
 */

function isJsonStringifyCall(node: any): boolean {
    return (
        node.type === AST_NODE_TYPES.CallExpression &&
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.object.type === AST_NODE_TYPES.Identifier &&
        node.callee.object.name === 'JSON' &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.name === 'stringify'
    )
}

/**
 * Check if node is representing syntax of the form getLogger().f(msg) for some f and msg.
 *
 */
function isLoggerCall(node: any): boolean {
    return (
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.object.type === AST_NODE_TYPES.CallExpression &&
        node.callee.object.callee.type === AST_NODE_TYPES.Identifier &&
        node.callee.object.callee.name === 'getLogger'
    )
}

/**
 * Use two simple heuristics to detect `disguised` logger calls. This is when we log without getLogger.
 * Ex.
 *      const logger = getLogger()
 *      logger.debug(m)
 * To catch these we try two checks:
 *  1) If the left side is an identifier including the word logger
 *  2) If the left side is a property of some object, including the word logger.
 */
function isDisguisedLoggerCall(node: any): boolean {
    return (
        (node.callee.type === AST_NODE_TYPES.MemberExpression &&
            node.callee.object.type === AST_NODE_TYPES.Identifier &&
            node.callee.object.name.toLowerCase().includes('logger')) ||
        (node.callee.type === AST_NODE_TYPES.MemberExpression &&
            node.callee.object.type === AST_NODE_TYPES.MemberExpression &&
            node.callee.object.property.name.toLowerCase().includes('logger'))
    )
}

export default ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        docs: {
            description: 'disallow use of JSON.stringify in logs and errors, to encourage use %O',
            recommended: 'recommended',
        },
        messages: {
            errMsg,
        },
        type: 'problem',
        fixable: 'code',
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
                // Look for a getLogger().f() call or a disguised one, see isDisguisedLoggerCall for more info.
                if (isLoggerCall(node) || isDisguisedLoggerCall(node)) {
                    // For each argument to the call above, check if it contains a JSON.stringify
                    node.arguments.forEach((arg) => {
                        // Check if arg itself if a JSON.stringify call
                        if (isJsonStringifyCall(arg)) {
                            return context.report({
                                node: node,
                                messageId: 'errMsg',
                            })
                        }
                        // Check if the arg contains a template ex. '${...}'
                        if (arg.type === AST_NODE_TYPES.TemplateLiteral) {
                            arg.expressions.forEach((e) => {
                                // Check the template for a JSON.stringify call.
                                if (isJsonStringifyCall(e)) {
                                    return context.report({
                                        node: node,
                                        messageId: 'errMsg',
                                    })
                                }
                            })
                        }
                    })
                }
            },
        }
    },
}) as unknown as Rule.RuleModule
