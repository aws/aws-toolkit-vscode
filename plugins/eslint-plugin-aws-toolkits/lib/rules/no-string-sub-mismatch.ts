/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ESLintUtils, TSESTree } from '@typescript-eslint/utils'

export default ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        docs: {
            description: 'ensure string substitution args and templates match',
            recommended: 'recommended',
        },
        messages: {},
        type: 'problem',
        fixable: 'code',
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {}
    },
})
