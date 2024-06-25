/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * .only() can be important during testing to test a specific feature/unit test.
 * This rule prevents us from accidentially committing this to the public repo.
 */

import { ESLintUtils, TSESTree } from '@typescript-eslint/utils'
import { AST_NODE_TYPES } from '@typescript-eslint/types'
import { Rule } from 'eslint'

function isValidExpression(node: TSESTree.CallExpression): TSESTree.MemberExpression | undefined {
    const isValid =
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.object.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.type === AST_NODE_TYPES.Identifier

    return isValid ? (node.callee as TSESTree.MemberExpression) : undefined
}

export const describeOnlyErrMsg = 'mocha test `.only()` not allowed for `describe`'
export const itOnlyErrMsg = 'mocha test `.only()` not allowed for `it`'

export default ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        docs: {
            description: "disallow mocha's only() from being published in test code",
            recommended: 'recommended',
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
                const expr = node.callee as TSESTree.MemberExpression
                const property = expr.property as TSESTree.Identifier
                const object = expr.object as TSESTree.Identifier

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
