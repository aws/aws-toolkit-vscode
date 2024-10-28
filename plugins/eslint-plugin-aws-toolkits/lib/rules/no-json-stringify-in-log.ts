/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils'
import { Rule } from 'eslint'

export const errMsg = 'Avoid using JSON.stringify within logging and error messages, prefer %O.'

function isJsonStringifyCall(node: any) {
    return (
        node.type === AST_NODE_TYPES.CallExpression &&
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.object.type === AST_NODE_TYPES.Identifier &&
        node.callee.object.name === 'JSON' &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.name === 'stringify'
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
                // Look for a getLogger().f() call.
                if (
                    node.callee.type === AST_NODE_TYPES.MemberExpression &&
                    node.callee.object.type === AST_NODE_TYPES.CallExpression &&
                    node.callee.object.callee.type === AST_NODE_TYPES.Identifier &&
                    node.callee.object.callee.name === 'getLogger'
                ) {
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
