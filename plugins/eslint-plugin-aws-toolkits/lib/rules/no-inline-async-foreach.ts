/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESLintUtils, TSESTree } from '@typescript-eslint/utils'
import { AST_NODE_TYPES } from '@typescript-eslint/types'
import { Rule } from 'eslint'

export const errMsg = 'Avoid using async methods with .forEach as it leads to race conditions and confusing behavior'

function isAsyncFunction(node: TSESTree.CallExpressionArgument): boolean {
    return (
        (node.type === AST_NODE_TYPES.ArrowFunctionExpression || node.type === AST_NODE_TYPES.FunctionExpression) &&
        node.async
    )
}
export default ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        docs: {
            description: 'disallow inlining async functions with .forEach',
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
                    node.callee.type === AST_NODE_TYPES.MemberExpression &&
                    node.callee.property.type === AST_NODE_TYPES.Identifier &&
                    node.callee.property.name === 'forEach' &&
                    node.arguments.length >= 1 &&
                    isAsyncFunction(node.arguments[0])
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
