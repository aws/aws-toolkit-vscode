/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESLintUtils, TSESTree } from '@typescript-eslint/utils'
import { AST_NODE_TYPES } from '@typescript-eslint/types'
import { Rule } from 'eslint'

export const errMsg = 'Avoid using .forEach as it can lead to race conditions'

export default ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        docs: {
            description: 'disallow async functions with .forEach',
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
                    node.arguments.length >= 1
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
