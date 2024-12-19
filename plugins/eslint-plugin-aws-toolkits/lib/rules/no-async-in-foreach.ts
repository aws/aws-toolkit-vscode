/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESLintUtils, TSESTree } from '@typescript-eslint/utils'
import { AST_NODE_TYPES } from '@typescript-eslint/types'
import { Rule } from 'eslint'
import { RuleContext } from '@typescript-eslint/utils/ts-eslint'

export const errMsg = 'Avoid using async methods with .forEach as it leads to race conditions'

function isFunctionExpression(
    node: TSESTree.Node
): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
    return node.type === AST_NODE_TYPES.ArrowFunctionExpression || node.type === AST_NODE_TYPES.FunctionExpression
}

function isAsyncFunction<T extends string, T2 extends readonly unknown[]>(
    context: RuleContext<T, T2>,
    funcNode: TSESTree.CallExpressionArgument
) {
    if (funcNode.type === AST_NODE_TYPES.Identifier) {
        const scope = context.sourceCode.getScope(funcNode)
        const maybeFNode =
            scope.variables.find((v) => v.name === funcNode.name)?.defs.find((d) => !!d)?.node ?? undefined
        // function declartions Ex. async function f() {}
        if (
            maybeFNode &&
            (isFunctionExpression(maybeFNode) || maybeFNode.type === AST_NODE_TYPES.FunctionDeclaration) &&
            maybeFNode.async
        ) {
            return true
        }
        // variable-style function declarations Ex. const f = async function () {}
        if (
            maybeFNode &&
            maybeFNode.type === AST_NODE_TYPES.VariableDeclarator &&
            maybeFNode.init &&
            isFunctionExpression(maybeFNode.init) &&
            maybeFNode.init.async
        ) {
            return true
        }
        return false
    }
    return (
        (funcNode.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            funcNode.type === AST_NODE_TYPES.FunctionExpression) &&
        funcNode.async
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
                    node.arguments.length >= 1
                ) {
                    if (isAsyncFunction(context, node.arguments[0])) {
                        return context.report({
                            node: node,
                            messageId: 'errMsg',
                        })
                    }
                }
            },
        }
    },
}) as unknown as Rule.RuleModule
