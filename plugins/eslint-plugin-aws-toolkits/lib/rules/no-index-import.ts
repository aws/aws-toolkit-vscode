/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESLintUtils, TSESTree } from '@typescript-eslint/utils'
import { Rule } from 'eslint'
import path from 'path'
// eslint-disable-next-line no-restricted-imports
import * as fs from 'fs'

export const errMsg =
    'do not import from folders or index.ts files since it can cause circular dependencies. import from the file directly.'

/**
 * Prevents TS imports from index.ts in packages/core/src (test files ignored).
 * It is easy to create cryptic circular dependency issues in packages/core due to the current import/export structure.
 *
 * Example:
 * - index.ts
 *     export Auth from './auth'
 *     export Connection from './connection'
 * - auth.ts
 *     export class Auth
 * - connection.ts
 *     import { Auth } from '.'                // circular dependency
 *     export type Connection
 *
 * This is a problem because connection.ts depends on index.ts to export 'Auth', which depends on connection.ts
 * to export `Connection`.
 */
export default ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        docs: {
            description: 'disallow importing from index.ts files in packages/core/src/',
            recommended: 'recommended',
        },
        messages: {
            default: errMsg,
        },
        type: 'problem',
        fixable: 'code',
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        const filePath = context.physicalFilename
        if (!filePath.match(/packages\/core\/src\/(?!test)/)) {
            // only trigger for import statements inside packages/core/ src files,
            // but don't include test files
            return {}
        }

        return {
            ImportDeclaration(node: TSESTree.ImportDeclaration) {
                const relativeImportPath = node.source.value

                // likely importing from some external module or is an irrelevant file
                if (
                    !relativeImportPath.startsWith('.') ||
                    ['.json', '.js', '.vue'].includes(path.extname(relativeImportPath))
                ) {
                    return
                }

                const absoluteImportPath = path
                    .resolve(path.dirname(filePath), relativeImportPath)
                    .replace(/(\.d)?\.ts/, '') // remove any .d.ts or .ts file extensions on the import (unlikely)

                if (path.basename(absoluteImportPath) !== 'index') {
                    // Not an index.ts file but is some typescript file.
                    if (['.ts', '.d.ts'].some((e) => fs.existsSync(absoluteImportPath + e))) {
                        return
                    }

                    // If it does not exist as a folder, then the path is simply wrong. Another, more descriptive error will surface instead.
                    if (!fs.existsSync(absoluteImportPath)) {
                        return
                    }
                }

                return context.report({
                    node: node.source,
                    messageId: 'default',
                    // TODO: We can add a fixer to resolve the import for us.
                    // fix: (fixer) => {
                    //     // somehow parse the exports of the imported index.ts file to get the actual export path,
                    //     // then replace the index import with it.
                    //     return fixer.replaceText(node.source, newImport)
                    // },
                })
            },
        }
    },
}) as unknown as Rule.RuleModule
