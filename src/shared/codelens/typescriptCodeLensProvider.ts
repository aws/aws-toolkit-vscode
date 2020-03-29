/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { findFileInParentPaths } from '../filesystemUtilities'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { normalizeSeparator } from '../utilities/pathUtils'
import { localize } from '../utilities/vsCodeUtils'
import { getHandlerRelativePath } from './localLambdaRunner'


export async function getSamProjectDirPathForFile(filepath: string): Promise<string> {
    const packageJsonPath: string | undefined = await findFileInParentPaths(path.dirname(filepath), 'package.json')
    if (!packageJsonPath) {
        throw new Error( // TODO: Do we want to localize errors? This might be confusing if we need to review logs.
            localize(
                'AWS.error.sam.local.package_json_not_found',
                'Cannot find package.json related to: {0}',
                filepath
            )
        )
    }

    return path.dirname(packageJsonPath)
}

/**
 * Applies a full relative path to the Javascript handler that will be stored in the CodeLens commands.
 * @param handlers Handlers to apply relative paths to
 * @param parentDocumentPath Path to the file containing these Lambda Handlers
 */
export async function decorateHandlerNames(handlers: LambdaHandlerCandidate[], parentDocumentPath: string): Promise<void> {
    const parentDir = path.dirname(parentDocumentPath)
    const packageJsonPath = await findFileInParentPaths(parentDir, 'package.json')

    if (!packageJsonPath) {
        return
    }

    const relativePath = getHandlerRelativePath({
        codeRoot: path.dirname(packageJsonPath),
        filePath: parentDocumentPath
    })

    handlers.forEach(handler => {
        const handlerName = handler.handlerName

        handler.handlerName = normalizeSeparator(path.join(relativePath, handlerName))
    })
}
