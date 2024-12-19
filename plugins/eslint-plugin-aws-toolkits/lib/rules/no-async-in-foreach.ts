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

function isAsyncFuncIdentifier<T extends string, T2 extends readonly unknown[]>(
    context: RuleContext<T, T2>,
    funcNode: TSESTree.Identifier
): boolean {
    const scope = context.sourceCode.getScope(funcNode)
    const maybeFNode = scope.variables.find((v) => v.name === funcNode.name)?.defs.find((d) => !!d)?.node ?? undefined
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

function getClassDeclarationNode<T extends string, T2 extends readonly unknown[]>(
    context: RuleContext<T, T2>,
    node: TSESTree.Node
): TSESTree.ClassDeclaration | undefined {
    console.log('in getObjectNode with %O', node)
    if (node.type === AST_NODE_TYPES.MemberExpression) {
        return getClassDeclarationNode(context, node.object)
    }
    if (node.type === AST_NODE_TYPES.NewExpression && node.callee.type === AST_NODE_TYPES.Identifier) {
        const className = node.callee.name
        const scope = context.sourceCode.getScope(node)
        const maybeDefNode =
            (scope.variables
                .find((v) => v.name === className)
                ?.defs.find((d) => !!d && d.node.type === AST_NODE_TYPES.ClassDeclaration)
                ?.node as TSESTree.ClassDeclaration) ?? undefined
        return maybeDefNode
    }
    if (node.type === AST_NODE_TYPES.Identifier) {
        const scope = context.sourceCode.getScope(node)
        const maybeDefNode = scope.variables.find((v) => v.name === node.name)?.defs.find((d) => !!d)?.node ?? undefined
        console.log('got maybeDefNode %O', maybeDefNode)
        return undefined
    }
}

function isAsyncClassMethod(defObjNode: TSESTree.ClassDeclaration, functionName: string): boolean {
    return defObjNode.body.body.some(
        (n) =>
            n.type === AST_NODE_TYPES.MethodDefinition &&
            n.kind === 'method' &&
            n.key.type === AST_NODE_TYPES.Identifier &&
            n.key.name === functionName &&
            n.value.async
    )
}

function isAsyncFuncMemExpression<T extends string, T2 extends readonly unknown[]>(
    context: RuleContext<T, T2>,
    funcNode: TSESTree.MemberExpression
): boolean {
    console.log('in isAsyncMemExp')
    if (funcNode.object.type === AST_NODE_TYPES.MemberExpression) {
        return isAsyncFuncMemExpression(context, funcNode.object)
    }
    if (funcNode.property.type === AST_NODE_TYPES.Identifier) {
        const fName = funcNode.property.name
        const defObjNode = getClassDeclarationNode(context, funcNode.object)
        return isAsyncClassMethod(defObjNode!, fName)
    }
    return false
}

function isAsyncFunction<T extends string, T2 extends readonly unknown[]>(
    context: RuleContext<T, T2>,
    funcNode: TSESTree.CallExpressionArgument
) {
    if (funcNode.type === AST_NODE_TYPES.Identifier) {
        return isAsyncFuncIdentifier(context, funcNode)
    }
    if (funcNode.type === AST_NODE_TYPES.MemberExpression) {
        return isAsyncFuncMemExpression(context, funcNode)
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
