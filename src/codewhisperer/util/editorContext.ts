/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as codewhispererClient from '../client/codewhisperer'
import * as path from 'path'
import * as CodeWhispererConstants from '../models/constants'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { TelemetryHelper } from './telemetryHelper'
import { getLogger } from '../../shared/logger/logger'
import { runtimeLanguageContext } from './runtimeLanguageContext'
import {
    CodeWhispererSupplementalContext,
    fetchSupplementalContext,
} from './supplementalContext/supplementalContextUtil'
import { supplementalContextTimeoutInMs } from '../models/constants'
import { CodeWhispererUserGroupSettings } from './userGroupUtil'
import { isTestFile } from './supplementalContext/codeParsingUtil'
import { DependencyGraphFactory } from './dependencyGraph/dependencyGraphFactory'

let tabSize: number = getTabSizeSetting()

export function extractContextForCodeWhisperer(editor: vscode.TextEditor): codewhispererClient.FileContext {
    const document = editor.document
    const curPos = editor.selection.active
    const offset = document.offsetAt(curPos)
    TelemetryHelper.instance.cursorOffset = offset

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

    return {
        filename: getFileNameForRequest(editor),
        programmingLanguage: {
            languageName:
                runtimeLanguageContext.mapVscLanguageToCodeWhispererLanguage(editor.document.languageId) ??
                editor.document.languageId,
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
    allowCodeWithReference: boolean | undefined = undefined
): Promise<{
    request: codewhispererClient.ListRecommendationsRequest
    supplementalMetadata: Omit<CodeWhispererSupplementalContext, 'contents'> | undefined
}> {
    const fileContext = extractContextForCodeWhisperer(editor)

    const tokenSource = new vscode.CancellationTokenSource()
    setTimeout(() => {
        tokenSource.cancel()
    }, supplementalContextTimeoutInMs)

    // Send Cross file context to CodeWhisperer service if and only if
    // (1) User is CrossFile user group
    // (2) The supplemental context is from Supplemental Context but not UTG(unit test generator)
    const isUtg = await isTestFile(editor, DependencyGraphFactory.getDependencyGraph(editor.document.languageId))
    const supplementalContexts: CodeWhispererSupplementalContext | undefined =
        CodeWhispererUserGroupSettings.getUserGroup() === CodeWhispererConstants.UserGroup.CrossFile && !isUtg
            ? await fetchSupplementalContext(editor, tokenSource.token)
            : undefined

    const suppelmetalMetadata: Omit<CodeWhispererSupplementalContext, 'contents'> | undefined = supplementalContexts
        ? {
              isUtg: supplementalContexts.isUtg,
              isProcessTimeout: supplementalContexts.isProcessTimeout,
              contentsLength: supplementalContexts.contentsLength,
              latency: supplementalContexts.latency,
          }
        : undefined

    logSupplementalContext(supplementalContexts)

    if (allowCodeWithReference === undefined) {
        return {
            request: {
                fileContext: fileContext,
                nextToken: nextToken,
                supplementalContexts: supplementalContexts ? supplementalContexts.contents : [],
            },
            supplementalMetadata: suppelmetalMetadata,
        }
    }

    return {
        request: {
            fileContext: fileContext,
            nextToken: nextToken,
            referenceTrackerConfiguration: {
                recommendationsWithReferences: allowCodeWithReference ? 'ALLOW' : 'BLOCK',
            },
            supplementalContexts: supplementalContexts ? supplementalContexts.contents : [],
        },
        supplementalMetadata: suppelmetalMetadata,
    }
}

export async function buildGenerateRecommendationRequest(editor: vscode.TextEditor): Promise<{
    request: codewhispererClient.GenerateRecommendationsRequest
    supplementalMetadata: Omit<CodeWhispererSupplementalContext, 'contents'> | undefined
}> {
    const fileContext = extractContextForCodeWhisperer(editor)

    const tokenSource = new vscode.CancellationTokenSource()
    setTimeout(() => {
        tokenSource.cancel()
    }, supplementalContextTimeoutInMs)
    const supplementalContexts = await fetchSupplementalContext(editor, tokenSource.token)
    let supplemetalMetadata: Omit<CodeWhispererSupplementalContext, 'contents'> | undefined

    if (supplementalContexts) {
        supplemetalMetadata = {
            isUtg: supplementalContexts.isUtg,
            isProcessTimeout: supplementalContexts.isProcessTimeout,
            contentsLength: supplementalContexts.contentsLength,
            latency: supplementalContexts.latency,
        }
    }

    logSupplementalContext(supplementalContexts)

    return {
        request: {
            fileContext: fileContext,
            maxResults: CodeWhispererConstants.maxRecommendations,
            supplementalContexts: supplementalContexts?.contents ?? [],
        },
        supplementalMetadata: supplemetalMetadata,
    }
}

export function validateRequest(
    req: codewhispererClient.ListRecommendationsRequest | codewhispererClient.GenerateRecommendationsRequest
): boolean {
    const isLanguageNameValid = !(
        req.fileContext.programmingLanguage.languageName == undefined ||
        req.fileContext.programmingLanguage.languageName.length < 1 ||
        req.fileContext.programmingLanguage.languageName.length > 128 ||
        !runtimeLanguageContext.isLanguageSupported(req.fileContext.programmingLanguage.languageName)
    )
    const isFileNameValid = !(req.fileContext.filename == undefined || req.fileContext.filename.length < 1)
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

    getLogger().verbose(`
            isUtg: ${supplementalContext.isUtg},
            isProcessTimeout: ${supplementalContext.isProcessTimeout},
            contentsLength: ${supplementalContext.contentsLength},
            latency: ${supplementalContext.latency},
        `)

    supplementalContext.contents.forEach((context, index) => {
        getLogger().verbose(`
                -----------------------------------------------
                Chunk ${index}:${context.content}
                -----------------------------------------------
            `)
    })
}
