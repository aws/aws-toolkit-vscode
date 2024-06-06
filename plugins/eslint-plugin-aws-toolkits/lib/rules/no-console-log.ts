/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enforce usage of our getLogger() function instead of using node's built in console.log() and similar.
 * An eslint rule already exists for this (https://eslint.org/docs/latest/rules/no-console), but this
 * rule is trivial to implement and we can add our own error message, so here it is.
 */

import { ESLintUtils, TSESTree } from '@typescript-eslint/utils'
import { AST_NODE_TYPES } from '@typescript-eslint/types'
import { Rule } from 'eslint'

export const errMsg =
    'do not use console.log, console.warn, or console.err, or similar; instead, use `getLogger().info`, `getLogger().warn`, etc; disable this rule for files that cannot import getLogger()'

const disallowFunctions = new Set(['info', 'debug', 'error', 'warn', 'log'])

export default ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        docs: {
            description: 'disallow use of console.log() to encourage use of getLogger()',
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
            MemberExpression(node: TSESTree.MemberExpression) {
                // Exception for anything that isn't extension code (in a src/ folder) (e.g. build scripts, tests)
                if (context.physicalFilename.includes('test') || !context.physicalFilename.includes('src')) {
                    return
                }

                // Validate this node
                if (
                    node.object.type !== AST_NODE_TYPES.Identifier ||
                    node.object.name !== 'console' ||
                    node.property.type !== AST_NODE_TYPES.Identifier
                ) {
                    return
                }

                if (disallowFunctions.has(node.property.name)) {
                    return context.report({
                        node,
                        messageId: 'errMsg',
                    })
                }
            },
        }
    },
}) as unknown as Rule.RuleModule
