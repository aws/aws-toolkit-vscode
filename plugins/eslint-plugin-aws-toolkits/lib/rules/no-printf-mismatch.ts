/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { AST_NODE_TYPES, ESLintUtils, TSESTree } from '@typescript-eslint/utils'
import { isLoggerCall } from './no-json-stringify-in-log'
import { Rule } from 'eslint'

/**
 * reuse solution done in logger itself: https://github.com/winstonjs/winston/blob/195e55c7e7fc58914ae4967ea7b832c9e0ced930/lib/winston/logger.js#L27
 */
function countSubTokens(literalNode: TSESTree.StringLiteral) {
    const formatRegExp = /%[scdjifoO%]/g
    return literalNode.value.match(formatRegExp)?.length || 0
}
/**
 * Form the error message using templates or actual values.
 * Allows us to avoid copy pasting message into test file.
 */
export function formErrorMsg(substitutionTokens: string | number, numArgs: string | number): string {
    return `printf-style (console.log) call has ${substitutionTokens} format specifiers, but ${numArgs} arguments.`
}

export default ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        docs: {
            description: 'ensure string substitution args and templates match',
            recommended: 'recommended',
        },
        messages: {
            errMsg: formErrorMsg('{{ substitutionTokens }}', '{{ args }}'),
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
                    isLoggerCall(node) &&
                    node.arguments[0].type === AST_NODE_TYPES.Literal &&
                    typeof node.arguments[0].value === 'string'
                ) {
                    const numSubTokens = countSubTokens(node.arguments[0])
                    const numExtraArgs = node.arguments.length - 1
                    if (numSubTokens !== numExtraArgs) {
                        return context.report({
                            node: node,
                            data: {
                                substitutionTokens: numSubTokens,
                                args: numExtraArgs,
                            },
                            messageId: 'errMsg',
                        })
                    }
                }
            },
        }
    },
}) as unknown as Rule.RuleModule
