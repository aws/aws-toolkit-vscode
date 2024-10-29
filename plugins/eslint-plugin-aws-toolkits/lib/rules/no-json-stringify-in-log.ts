/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AST_NODE_TYPES, ESLintUtils, TSESTree } from '@typescript-eslint/utils'
import { Rule } from 'eslint'

export const errMsg = 'Avoid using JSON.stringify within logging and error messages, prefer %O.'

/**
 * Check if a given expression is a JSON.stringify call.
 */
function isJsonStringifyCall(node: TSESTree.CallExpressionArgument): boolean {
    return (
        node.type === AST_NODE_TYPES.CallExpression &&
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.object.type === AST_NODE_TYPES.Identifier &&
        node.callee.object.name === 'JSON' &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.name === 'stringify'
    )
}

function isTemplateWithStringifyCall(node: TSESTree.CallExpressionArgument): boolean {
    return (
        node.type === AST_NODE_TYPES.TemplateLiteral &&
        node.expressions.some((e: TSESTree.Expression) => isJsonStringifyCall(e))
    )
}

/**
 * Check if node is representing syntax of the form getLogger().f(msg) for some f and msg or
 * if it is doing so indirectly via a logger variable.
 */
export function isLoggerCall(node: TSESTree.CallExpression): boolean {
    return (
        (node.callee.type === AST_NODE_TYPES.MemberExpression &&
            node.callee.object.type === AST_NODE_TYPES.CallExpression &&
            node.callee.object.callee.type === AST_NODE_TYPES.Identifier &&
            node.callee.object.callee.name === 'getLogger') ||
        isDisguisedLoggerCall(node)
    )
}

/**
 * Use two simple heuristics to detect `disguised` logger calls. This is when we log without getLogger in the same statement.
 * Ex.
 *      const logger = getLogger()
 *      logger.debug(m)
 * To catch these we try two checks:
 *  1) If the left side is an identifier including the word logger
 *  2) If the left side is a property of some object, including the word logger.
 */
function isDisguisedLoggerCall(node: TSESTree.CallExpression): boolean {
    return (
        (node.callee.type === AST_NODE_TYPES.MemberExpression &&
            node.callee.object.type === AST_NODE_TYPES.Identifier &&
            node.callee.object.name.toLowerCase().includes('logger')) ||
        (node.callee.type === AST_NODE_TYPES.MemberExpression &&
            node.callee.object.type === AST_NODE_TYPES.MemberExpression &&
            node.callee.object.property.type === AST_NODE_TYPES.Identifier &&
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
            CallExpression(node: TSESTree.CallExpression) {
                if (
                    isLoggerCall(node) &&
                    node.arguments.some((arg) => isJsonStringifyCall(arg) || isTemplateWithStringifyCall(arg))
                ) {
                    return context.report({
                        node: node,
                        messageId: 'errMsg',
                    })
                }
            },
        }
    },
}) as unknown as Rule.RuleModule
