/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This rule aims to prevent developers from misusing the once() util function. It is possible
 * that they intended for code to run only once, but due to certain usage patterns it is actually
 * executed many times due to the nature of the once() function.
 *
 * NOTE: This problem is not trivial and there may be false positives/negatives. It may not be
 * complete. We can ignore the rule and amend this function if edge cases are found. As of this
 * writing it correctly identified all known good and bad cases in the codebase.
 *
 * Details:
 * once() is a commonly used util function defined in src/shared/utilities/functionUtils.ts.
 * It works by accepting a function as input, and returns a new function that can only ever be
 * executed one time. This "one time use" only applies to that specific instance of once, so if
 * the instance is not re-used, then once() serves no purpose. Examples:
 *
 * ```
 * function log() {
 *     const logOnce = once(() => console.log('hello'))
 *     logOnce()
 * }
 * log()
 * log()
 * ```
 *
 * This prints 'hello' multiple times.
 *
 * The correct usage is:
 * ```
 * let logOnce
 * function log() {
 *     logOnce ?= once(() => console.log('hello'))
 *     logOnce()
 * }
 * log()
 * log()
 * ```
 *
 * This prints 'hello' only one time.
 *
 * This rule will try to detect when once() has been used in a way that could make the
 * developer think the code will only run once, but in reality will run each time since a new
 * once() instance is being created each time.
 */

import { ESLintUtils } from '@typescript-eslint/utils'
import { AST_NODE_TYPES } from '@typescript-eslint/types'
import { Node, Identifier } from '@typescript-eslint/types/dist/generated/ast-spec'
import { Rule } from 'eslint'

export const oneOffErr =
    '`once()` is being called immediately after it returns, which will make a new `once` instance each time. This means the passed function can effectively run many times. Remove once or assign to a higher level-variable that can be re-used.'
export const notAssignedErr =
    '`once()` is not being assigned, so it cannot be re-used. This may result in the inner function being called multiple times.'
export const notReusableErr =
    '`once()` does not appear to be used in a re-usable context, e.g. a nested loop scope, object property assignment, top-level declaration, or literally only called a single time. If it is not re-usable, then once() serves no purpose. (If this error seems incorrect, disable with // eslint-disable-line)'

export default ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        docs: {
            description: 'disallow usages of once() where the function can be called multiple times',
            recommended: 'error',
        },
        messages: {
            oneOffErr,
            notAssignedErr,
            notReusableErr,
        },
        type: 'problem',
        fixable: 'code',
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            // Check for calls of once (e.g. once()()) and assignment of once (e.g. const x = once())
            CallExpression(node) {
                if (
                    node.callee.type !== AST_NODE_TYPES.Identifier || // check for any func()
                    node.callee.name !== 'once' // check for once() and not myFunc()
                ) {
                    return
                }

                // Check for once()()
                if (node.parent?.type === AST_NODE_TYPES.CallExpression) {
                    return context.report({
                        node: node.parent,
                        messageId: 'oneOffErr',
                    })
                }

                // Check for cases where we don't assign once() to anything.
                if (
                    node.parent?.type !== AST_NODE_TYPES.VariableDeclarator &&
                    node.parent?.type !== AST_NODE_TYPES.AssignmentExpression &&
                    node.parent?.type !== AST_NODE_TYPES.PropertyDefinition
                ) {
                    return context.report({
                        node: node,
                        messageId: 'notAssignedErr',
                    })
                }
            },
            // Check that assignments of once() are valid, e.g. re-usable in other scopes.
            VariableDeclaration(node) {
                // Top-level module assignment is ok
                if (
                    node.parent?.type === AST_NODE_TYPES.Program ||
                    node.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration
                ) {
                    return
                }

                node.declarations.forEach(declaration => {
                    if (
                        declaration.init?.type === AST_NODE_TYPES.CallExpression &&
                        declaration.id.type === AST_NODE_TYPES.Identifier &&
                        declaration.init.callee?.type === AST_NODE_TYPES.Identifier &&
                        declaration.init.callee.name === 'once'
                    ) {
                        const scope = context.getScope()
                        const variable = scope.variables.find(v => v.name === (declaration.id as Identifier).name) // we already confirmed the type in the if statement... why is TS mad?
                        let isUsedInLoopScope = false

                        if (variable) {
                            const refs = variable.references.filter(ref => ref.identifier !== declaration.id)

                            // Check if it is being referenced multiple times
                            // TODO: expand to check if it is being referenced inside nested scopes only? (currently checks current scope as well)
                            if (refs.length > 1) {
                                return
                            }

                            // Check if it is being referenced once, but inside a loop.
                            refs.forEach(ref => {
                                let currNode: Node | undefined = ref.identifier

                                while (currNode && currNode !== scope.block) {
                                    if (
                                        currNode.type === AST_NODE_TYPES.ForStatement ||
                                        currNode.type === AST_NODE_TYPES.ForInStatement ||
                                        currNode.type === AST_NODE_TYPES.ForOfStatement ||
                                        currNode.type === AST_NODE_TYPES.WhileStatement ||
                                        currNode.type === AST_NODE_TYPES.DoWhileStatement
                                    ) {
                                        isUsedInLoopScope = true
                                        break
                                    }
                                    currNode = currNode.parent
                                }
                            })
                        }

                        // If the variable is somehow not assigned? or only used once and not in a loop.
                        if (variable === undefined || !isUsedInLoopScope) {
                            return context.report({
                                node: declaration.init.callee,
                                messageId: 'notReusableErr',
                            })
                        }
                    }
                })
            },
        }
    },
}) as unknown as Rule.RuleModule
