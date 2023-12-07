/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESLintUtils } from '@typescript-eslint/utils'
import { AST_NODE_TYPES } from '@typescript-eslint/types'
import { CallExpression, Identifier, MemberExpression } from '@typescript-eslint/types/dist/generated/ast-spec'
import { Rule } from 'eslint'

function isValidExpression(node: CallExpression): MemberExpression | undefined {
    const isValid =
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.object.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.type === AST_NODE_TYPES.Identifier

    return isValid ? (node.callee as MemberExpression) : undefined
}

export const describeOnlyErrMsg = 'mocha test `.only()` not allowed for `describe`'
export const itOnlyErrMsg = 'mocha test `.only()` not allowed for `it`'

export default ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        docs: {
            description: "disallow mocha's only() from being published in test code",
            recommended: 'error',
        },
        messages: {
            describeOnlyErrMsg,
            itOnlyErrMsg,
        },
        type: 'problem',
        fixable: 'code',
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
                if (!isValidExpression(node)) {
                    return
                }
                const expr = node.callee as MemberExpression
                const property = expr.property as Identifier
                const object = expr.object as Identifier

                if (property.name !== 'only') {
                    return
                }

                if (object.name === 'describe' || object.name === 'it') {
                    return context.report({
                        node: node.callee,
                        messageId: `${object.name}OnlyErrMsg`,
                        fix: fixer => {
                            // Range - 1 removes the period in `it.only()`
                            return fixer.removeRange([property.range[0] - 1, property.range[1]])
                        },
                    })
                }
            },
        }
    },
}) as unknown as Rule.RuleModule
