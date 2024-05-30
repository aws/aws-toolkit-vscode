/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Developers sometimes use string input form of child_process.exec (and similar functions), e.g.:
 * `child_process.execSync(`vsce package --ignoreFile "../.vscodeignore.packages"`, { stdio: 'inherit' })`
 * However, the array input form functions should be used instead:
 * child_process.execFile('vsce', ['package', '--ignoreFile', '../.vscodeignore.packages'], { stdio: 'inherit' })
 *
 * The "string form" is highly discouraged because
 * (1) it invokes a shell, which has security and performance costs, and
 * (2) it causes bugs related to platform specific quoting rules (and other shell forms such as $foo vs %foo%, etc).
 */

import { ESLintUtils, TSESTree } from '@typescript-eslint/utils'
import { AST_NODE_TYPES } from '@typescript-eslint/types'
import { Rule } from 'eslint'

export const errMsg =
    "do not use child_process functions that accept string inputs (e.g. `exec('ls -h')`), instead use those with array inputs, e.g. `execFile('ls', ['-h'])`"

// child_process functions that accept string input
const disallowedFunctions = new Set(['exec', 'execSync'])

export default ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        docs: {
            description: 'disallow child_process functions that allow string inputs over array inputs',
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
        let libImportName: string | undefined

        return {
            ImportDeclaration(node: TSESTree.ImportDeclaration) {
                // Detect imports for child_process
                if (node.source.value === 'child_process') {
                    node.specifiers.forEach(specifier => {
                        if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
                            // Detect the name of the import, e.g. "proc" from "import * as proc from child_process"
                            libImportName = specifier.local.name
                        } else if (
                            // Detect importing directly, e.g. "import { exec } from child_process"
                            specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                            disallowedFunctions.has(specifier.imported.name)
                        ) {
                            context.report({
                                node,
                                messageId: 'errMsg',
                            })
                        }
                    })
                }
            },
            CallExpression(node: TSESTree.CallExpression) {
                // Example: proc.execSync('...')
                if (
                    !libImportName || // child_process not imported
                    node.callee.type !== AST_NODE_TYPES.MemberExpression || // proc.execSync
                    node.callee.object.type !== AST_NODE_TYPES.Identifier || // object is proc
                    node.callee.property.type !== AST_NODE_TYPES.Identifier // property is execSync
                ) {
                    return
                }
                if (
                    node.callee.object.name === libImportName && // "proc" is the name from the statement "import * as proc from child_process"
                    disallowedFunctions.has(node.callee.property.name)
                ) {
                    return context.report({
                        node,
                        messageId: 'errMsg',
                    })
                }
            },
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Program:exit'() {
                // Reset after each file is checked
                libImportName = undefined
            },
        }
    },
}) as unknown as Rule.RuleModule
