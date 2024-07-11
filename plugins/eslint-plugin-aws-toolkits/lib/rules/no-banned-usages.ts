/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESLintUtils } from '@typescript-eslint/utils'
import { AST_NODE_TYPES } from '@typescript-eslint/types'
import { Rule } from 'eslint'
// import * as util from 'util'

export const errMsgs = {
    setContext: 'Use shared/vscode/setContext.ts, do not use executeCommand("setContext") directly',
}

/**
 * Prevents use of banned APIs:
 *
 * - vscode.commands.executeCommand('setContext', …)
 */
export default ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        docs: {
            description: 'disallow use of banned APIs',
            recommended: 'recommended',
        },
        messages: errMsgs,
        type: 'problem',
        fixable: 'code',
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
                if (
                    node.callee.type !== AST_NODE_TYPES.MemberExpression ||
                    node.callee.property.type !== AST_NODE_TYPES.Identifier ||
                    node.callee.parent.type !== AST_NODE_TYPES.CallExpression
                ) {
                    return
                }

                const args = node.callee.parent.arguments

                if (args[0]?.type !== AST_NODE_TYPES.Literal) {
                    return
                }

                if (node.callee.property.name === 'executeCommand' && args[0].value === 'setContext') {
                    return context.report({
                        node,
                        messageId: 'setContext',
                    })
                }
            },
        }
    },
}) as unknown as Rule.RuleModule
