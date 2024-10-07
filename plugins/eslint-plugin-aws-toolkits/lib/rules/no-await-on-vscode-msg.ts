/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Showing vscode notifications is an async process. If we await on a notification, then we are
 * telling VSCode that we need a response from the user to continue the codepath. Not all
 * notifications require user input, so a user may ignore one indefinitely, blocking the codepath.
 * Awaiting without assigning or otherwise using the response could keep code blocked and cause subtle issues.
 */

import { ESLintUtils, TSESTree } from '@typescript-eslint/utils'
import { AST_NODE_TYPES } from '@typescript-eslint/types'
import { Rule } from 'eslint'

export const errMsg =
    'cannot await on vscode window messages unless the response is assigned; use `void`, assign to a response variable, or add a .then callback'

const notificationFuncNames = ['showInformationMessage', 'showWarningMessage', 'showErrorMessage']

function isVariableAssignment(node: TSESTree.Node) {
    while (node.parent) {
        if (node.parent.type === AST_NODE_TYPES.VariableDeclarator) {
            return true // we are assigning the response, i.e. its being used.
        } else if (node.parent.type === AST_NODE_TYPES.ConditionalExpression) {
            node = node.parent
        } else {
            return false
        }
    }
    return false
}

export default ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        docs: {
            description: 'disallow awaiting on vscode notifications if the response is unused',
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
            AwaitExpression(node) {
                if (isVariableAssignment(node)) {
                    // we are assigning the response, i.e. its being used.
                    return
                }

                if (node.parent?.type === AST_NODE_TYPES.IfStatement) {
                    return // we are in an if statement, so we are probably expecting a response
                }

                if (node.argument.type !== AST_NODE_TYPES.CallExpression) {
                    return
                }

                const expr = node.argument.callee
                let property
                if (expr.type === AST_NODE_TYPES.MemberExpression) {
                    property = expr.property as TSESTree.Identifier
                } else if (expr.type === AST_NODE_TYPES.Identifier) {
                    property = expr as TSESTree.Identifier
                } else {
                    return
                }

                if (property.name === 'then') {
                    return // we are using the response in a callback, but waiting on it.
                }

                if (notificationFuncNames.includes(property.name)) {
                    return context.report({
                        node,
                        messageId: 'errMsg',
                    })
                }
            },
        }
    },
}) as unknown as Rule.RuleModule
