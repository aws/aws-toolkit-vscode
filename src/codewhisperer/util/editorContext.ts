/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as codewhispererClient from '../client/codewhisperer'
import * as path from 'path'
import * as CodeWhispererConstants from '../models/constants'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { getLogger } from '../../shared/logger/logger'
import { runtimeLanguageContext } from './runtimeLanguageContext'
import { fetchSupplementalContext } from './supplementalContext/supplementalContextUtil'
import { supplementalContextTimeoutInMs } from '../models/constants'
import { getSelectedCustomization } from './customizationUtil'
import { selectFrom } from '../../shared/utilities/tsUtils'
import { checkLeftContextKeywordsForJsonAndYaml } from './commonUtil'
import { CodeWhispererSupplementalContext } from '../models/model'
import { getOptOutPreference } from './commonUtil'

let tabSize: number = getTabSizeSetting()

export function extractContextForCodeWhisperer(editor: vscode.TextEditor): codewhispererClient.FileContext {
    const document = editor.document
    const curPos = editor.selection.active
    const offset = document.offsetAt(curPos)

    const caretLeftFileContext = editor.document.getText(
        new vscode.Range(
            document.positionAt(offset - CodeWhispererConstants.charactersLimit),
            document.positionAt(offset)
        )
    )

    const caretRightFileContext = editor.document.getText(
        new vscode.Range(
            document.positionAt(offset),
            document.positionAt(offset + CodeWhispererConstants.charactersLimit)
        )
    )
    if (checkLeftContextKeywordsForJsonAndYaml(caretLeftFileContext, editor.document.languageId)) {
        return {
            filename: getFileNameForRequest(editor),
            programmingLanguage: {
                languageName: 'plaintext',
            },
            leftFileContent: caretLeftFileContext,
            rightFileContent: caretRightFileContext,
        } as codewhispererClient.FileContext
    }

    if (checkLeftContextKeywordsForJsonAndYaml(caretLeftFileContext, editor.document.languageId)) {
        return {
            filename: getFileNameForRequest(editor),
            programmingLanguage: {
                languageName: 'plaintext',
            },
            leftFileContent: caretLeftFileContext,
            rightFileContent: caretRightFileContext,
        } as codewhispererClient.FileContext
    }

    return {
        filename: getFileNameForRequest(editor),
        programmingLanguage: {
            languageName:
                runtimeLanguageContext.normalizeLanguage(editor.document.languageId) ?? editor.document.languageId,
        },
        leftFileContent: caretLeftFileContext,
        rightFileContent: caretRightFileContext,
    } as codewhispererClient.FileContext
}

export function getFileName(editor: vscode.TextEditor): string {
    const fileName = path.basename(editor.document.fileName)
    return fileName.substring(0, CodeWhispererConstants.filenameCharsLimit)
}

export function getFileNameForRequest(editor: vscode.TextEditor): string {
    const fileName = path.basename(editor.document.fileName)

    // For notebook files, we want to use the programming language for each cell for the code suggestions, so change
    // the filename sent in the request to reflect that language
    if (fileName.endsWith('.ipynb')) {
        const fileExtension = runtimeLanguageContext.getLanguageExtensionForNotebook(editor.document.languageId)
        if (fileExtension !== undefined) {
            const filenameWithNewExtension = fileName.substring(0, fileName.length - 5) + fileExtension
            return filenameWithNewExtension.substring(0, CodeWhispererConstants.filenameCharsLimit)
        }
    }
    return fileName.substring(0, CodeWhispererConstants.filenameCharsLimit)
}

export async function buildListRecommendationRequest(
    editor: vscode.TextEditor,
    nextToken: string,
    allowCodeWithReference: boolean
): Promise<{
    request: codewhispererClient.ListRecommendationsRequest
    supplementalMetadata: Omit<CodeWhispererSupplementalContext, 'supplementalContextItems'> | undefined
}> {
    const fileContext = extractContextForCodeWhisperer(editor)

    const tokenSource = new vscode.CancellationTokenSource()
    setTimeout(() => {
        tokenSource.cancel()
    }, supplementalContextTimeoutInMs)

    const supplementalContexts = await fetchSupplementalContext(editor, tokenSource.token)

    const supplementalMetadata: Omit<CodeWhispererSupplementalContext, 'supplementalContextItems'> | undefined =
        supplementalContexts
            ? {
                  isUtg: supplementalContexts.isUtg,
                  isProcessTimeout: supplementalContexts.isProcessTimeout,
                  contentsLength: supplementalContexts.contentsLength,
                  latency: supplementalContexts.latency,
                  strategy: supplementalContexts.strategy,
              }
            : undefined

    logSupplementalContext(supplementalContexts)

    const selectedCustomization = getSelectedCustomization()
    const supplementalContext: codewhispererClient.SupplementalContext[] = supplementalContexts
        ? supplementalContexts.supplementalContextItems.map(v => {
              return selectFrom(v, 'content', 'filePath')
          })
        : []

    return {
        request: {
            fileContext: fileContext,
            nextToken: nextToken,
            referenceTrackerConfiguration: {
                recommendationsWithReferences: allowCodeWithReference ? 'ALLOW' : 'BLOCK',
            },
            supplementalContexts: supplementalContext,
            customizationArn: selectedCustomization.arn === '' ? undefined : selectedCustomization.arn,
            optOutPreference: getOptOutPreference(),
        },
        supplementalMetadata: supplementalMetadata,
    }
}

export async function buildGenerateRecommendationRequest(editor: vscode.TextEditor): Promise<{
    request: codewhispererClient.GenerateRecommendationsRequest
    supplementalMetadata: Omit<CodeWhispererSupplementalContext, 'supplementalContextItems'> | undefined
}> {
    const fileContext = extractContextForCodeWhisperer(editor)

    const tokenSource = new vscode.CancellationTokenSource()
    setTimeout(() => {
        tokenSource.cancel()
    }, supplementalContextTimeoutInMs)
    const supplementalContexts = await fetchSupplementalContext(editor, tokenSource.token)
    let supplementalMetadata: Omit<CodeWhispererSupplementalContext, 'supplementalContextItems'> | undefined

    if (supplementalContexts) {
        supplementalMetadata = {
            isUtg: supplementalContexts.isUtg,
            isProcessTimeout: supplementalContexts.isProcessTimeout,
            contentsLength: supplementalContexts.contentsLength,
            latency: supplementalContexts.latency,
            strategy: supplementalContexts.strategy,
        }
    }

    logSupplementalContext(supplementalContexts)

    return {
        request: {
            fileContext: fileContext,
            maxResults: CodeWhispererConstants.maxRecommendations,
            supplementalContexts: supplementalContexts?.supplementalContextItems ?? [],
        },
        supplementalMetadata: supplementalMetadata,
    }
}

export function validateRequest(
    req: codewhispererClient.ListRecommendationsRequest | codewhispererClient.GenerateRecommendationsRequest
): boolean {
    const isLanguageNameValid =
        req.fileContext.programmingLanguage.languageName !== undefined &&
        req.fileContext.programmingLanguage.languageName.length >= 1 &&
        req.fileContext.programmingLanguage.languageName.length <= 128 &&
        (runtimeLanguageContext.isLanguageSupported(req.fileContext.programmingLanguage.languageName) ||
            runtimeLanguageContext.isFileFormatSupported(
                req.fileContext.filename.substring(req.fileContext.filename.lastIndexOf('.') + 1)
            ))
    const isFileNameValid = !(req.fileContext.filename === undefined || req.fileContext.filename.length < 1)
    const isFileContextValid = !(
        req.fileContext.leftFileContent.length > CodeWhispererConstants.charactersLimit ||
        req.fileContext.rightFileContent.length > CodeWhispererConstants.charactersLimit
    )
    if (isFileNameValid && isLanguageNameValid && isFileContextValid) {
        return true
    }
    return false
}

export function updateTabSize(val: number): void {
    tabSize = val
}

export function getTabSize(): number {
    return tabSize
}

export function getLeftContext(editor: vscode.TextEditor, line: number): string {
    let lineText = ''
    try {
        if (editor && editor.document.lineAt(line)) {
            lineText = editor.document.lineAt(line).text
            if (lineText.length > CodeWhispererConstants.contextPreviewLen) {
                lineText =
                    '...' +
                    lineText.substring(
                        lineText.length - CodeWhispererConstants.contextPreviewLen - 1,
                        lineText.length - 1
                    )
            }
        }
    } catch (error) {
        getLogger().error(`Error when getting left context ${error}`)
    }

    return lineText
}

function logSupplementalContext(supplementalContext: CodeWhispererSupplementalContext | undefined) {
    if (!supplementalContext) {
        return
    }

    let logString = `CodeWhispererSupplementalContext:
    isUtg: ${supplementalContext.isUtg},
    isProcessTimeout: ${supplementalContext.isProcessTimeout},
    contentsLength: ${supplementalContext.contentsLength},
    latency: ${supplementalContext.latency},
`
    supplementalContext.supplementalContextItems.forEach((context, index) => {
        logString += `Chunk ${index}:
        Path: ${context.filePath}
        Content: ${index}:${context.content}
        Score: ${context.score}
        -----------------------------------------------`
    })

    getLogger().debug(logString)
}
