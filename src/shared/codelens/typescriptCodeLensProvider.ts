/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { LambdaHandlerCandidate, RootlessLambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { TypescriptLambdaHandlerSearch } from '../typescriptLambdaHandlerSearch'
import { normalizeSeparator } from '../utilities/pathUtils'
import { findParentProjectFile } from '../utilities/workspaceUtils'

export const javascriptLanguage = 'javascript'

export const typescriptLanguage = 'typescript'

export const typescriptAllFiles: vscode.DocumentFilter[] = [
    {
        language: javascriptLanguage,
        scheme: 'file',
    },
    {
        language: typescriptLanguage,
        scheme: 'file',
    },
]

export const javascriptBasePattern = '**/package.json'

export async function getLambdaHandlerCandidates(document: vscode.TextDocument): Promise<LambdaHandlerCandidate[]> {
    const rootUri = (await findParentProjectFile(document.uri, /^package\.json$/)) || document.uri

    const search: TypescriptLambdaHandlerSearch = new TypescriptLambdaHandlerSearch(
        document.uri.fsPath,
        document.getText()
    )
    const unprocessedHandlers: RootlessLambdaHandlerCandidate[] = await search.findCandidateLambdaHandlers()

    // For Javascript CodeLenses, store the complete relative pathed handler name
    // (eg: src/app.handler) instead of only the pure handler name (eg: app.handler)
    // Without this, the CodeLens command is unable to resolve a match back to a sam template.
    // This is done to address https://github.com/aws/aws-toolkit-vscode/issues/757
    return await finalizeTsHandlers(unprocessedHandlers, document.uri, rootUri)
}

/**
 * Applies a full relative path to the Javascript handler that will be stored in the CodeLens commands.
 * Also adds `package.json` path
 * @param handlers Rootless handlers to apply relative paths to
 * @param uri URI of the file containing these Lambda Handlers
 * @param rootUri URI of `package.json` file or the source file if there isn't one found.
 */
async function finalizeTsHandlers(
    handlers: RootlessLambdaHandlerCandidate[],
    fileUri: vscode.Uri,
    rootUri: vscode.Uri
): Promise<LambdaHandlerCandidate[]> {
    const relativePath = path.relative(path.dirname(rootUri.fsPath), path.dirname(fileUri.fsPath))

    return handlers.map(handler => {
        return {
            filename: handler.filename,
            handlerName: normalizeSeparator(path.join(relativePath, handler.handlerName)),
            rootUri: rootUri,
            range: handler.range,
        }
    })
}
