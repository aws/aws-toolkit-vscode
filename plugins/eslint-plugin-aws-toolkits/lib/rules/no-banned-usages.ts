/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESLintUtils, TSESTree } from '@typescript-eslint/utils'
import { AST_NODE_TYPES } from '@typescript-eslint/types'
import { Rule } from 'eslint'
// import * as util from 'util'

export const errMsgs = {
    setContext: 'Use `shared/vscode/setContext.ts`, do not use `executeCommand("setContext")` directly',
    globalState: 'Use `globals.globalState`, do not use `ExtensionContext.globalState` directly or indirectly',
}

/**
 * Each key is the member name, value is its expected container name.
 */
const memberContainers: Record<string, string> = {
    // Disallow accesses like `extContext.globalState` and `globals.context.globalState`.
    // Preferred usage is exactly: `globals.globalState`.
    globalState: 'globals',
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
            MemberExpression(node: TSESTree.MemberExpression) {
                const o = node.object
                const p = node.property
                // Disallow accesses like: `banned1.member`.
                if (
                    o.type === AST_NODE_TYPES.Identifier &&
                    p.type === AST_NODE_TYPES.Identifier &&
                    typeof memberContainers[p.name] === 'string' &&
                    o.name !== memberContainers[p.name]
                ) {
                    return context.report({
                        node,
                        messageId: p.name as any,
                    })
                }

                // Disallow accesses like: `banned1.banned2.member`.
                if (
                    o.type === AST_NODE_TYPES.MemberExpression &&
                    o.object.type === AST_NODE_TYPES.Identifier &&
                    p.type === AST_NODE_TYPES.Identifier &&
                    typeof memberContainers[p.name] === 'string' &&
                    o.property.type === AST_NODE_TYPES.Identifier &&
                    o.property.name !== memberContainers[p.name]
                ) {
                    return context.report({
                        node,
                        messageId: p.name as any,
                    })
                }
            },
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
