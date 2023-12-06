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
import { selectFrom } from '../../shared/utilities/tsUtils'
import { checkLeftContextKeywordsForJsonAndYaml } from './commonUtil'
import { RequestContext } from '../models/model'

let tabSize: number = getTabSizeSetting()

export function extractContextForCodeWhisperer(editor: vscode.TextEditor): {
    fileContext: codewhispererClient.FileContext
    cursorOffset: number
} {
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
    if (checkLeftContextKeywordsForJsonAndYaml(caretLeftFileContext, editor.document.languageId)) {
        return {
            cursorOffset: offset,
            fileContext: {
                filename: getFileNameForRequest(editor),
                programmingLanguage: {
                    languageName: 'plaintext',
                },
                leftFileContent: caretLeftFileContext,
                rightFileContent: caretRightFileContext,
            } as codewhispererClient.FileContext,
        }
    }

    if (checkLeftContextKeywordsForJsonAndYaml(caretLeftFileContext, editor.document.languageId)) {
        return {
            cursorOffset: offset,
            fileContext: {
                filename: getFileNameForRequest(editor),
                programmingLanguage: {
                    languageName: 'plaintext',
                },
                leftFileContent: caretLeftFileContext,
                rightFileContent: caretRightFileContext,
            } as codewhispererClient.FileContext,
        }
    }

    return {
        cursorOffset: offset,
        fileContext: {
            filename: getFileNameForRequest(editor),
            programmingLanguage: {
                languageName:
                    runtimeLanguageContext.normalizeLanguage(editor.document.languageId) ?? editor.document.languageId,
            },
            leftFileContent: caretLeftFileContext,
            rightFileContent: caretRightFileContext,
        } as codewhispererClient.FileContext,
    }
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

export function buildListRecommendationRequest(
    requestContext: RequestContext,
    nextToken: string,
    allowCodeWithReference: boolean | undefined = undefined
): codewhispererClient.ListRecommendationsRequest {
    const fileContext = requestContext.fileContext
    const supplementalContexts = requestContext.supplementalContext
    const selectedCustomization = requestContext.customization

    const supplementalContext: codewhispererClient.SupplementalContext[] = supplementalContexts
        ? supplementalContexts.supplementalContextItems.map(v => {
              return selectFrom(v, 'content', 'filePath')
          })
        : []

    if (allowCodeWithReference === undefined) {
        return {
            fileContext: fileContext,
            nextToken: nextToken,
            supplementalContexts: supplementalContext,
            customizationArn: selectedCustomization.arn === '' ? undefined : selectedCustomization.arn,
        }
    }

    return {
        fileContext: fileContext,
        nextToken: nextToken,
        referenceTrackerConfiguration: {
            recommendationsWithReferences: allowCodeWithReference ? 'ALLOW' : 'BLOCK',
        },
        supplementalContexts: supplementalContext,
        customizationArn: selectedCustomization.arn === '' ? undefined : selectedCustomization.arn,
    }
}

export function buildGenerateRecommendationRequest(
    requestContext: RequestContext
): codewhispererClient.GenerateRecommendationsRequest {
    const fileContext = requestContext.fileContext
    const supplementalContexts = requestContext.supplementalContext

    return {
        fileContext: fileContext,
        maxResults: CodeWhispererConstants.maxRecommendations,
        supplementalContexts: supplementalContexts?.supplementalContextItems ?? [],
    }
}

export function validateRequest(
    req: codewhispererClient.ListRecommendationsRequest | codewhispererClient.GenerateRecommendationsRequest
): boolean {
    const isLanguageNameValid = !(
        req.fileContext.programmingLanguage.languageName === undefined ||
        req.fileContext.programmingLanguage.languageName.length < 1 ||
        req.fileContext.programmingLanguage.languageName.length > 128 ||
        !runtimeLanguageContext.isLanguageSupported(req.fileContext.programmingLanguage.languageName)
    )
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
