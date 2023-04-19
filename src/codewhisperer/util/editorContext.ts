/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
    return fileName
}

export function buildListRecommendationRequest(
    editor: vscode.TextEditor,
    nextToken: string,
    allowCodeWithReference: boolean | undefined = undefined
): codewhispererClient.ListRecommendationsRequest {
    let fileContext: codewhispererClient.FileContext
    if (editor !== undefined) {
        fileContext = extractContextForCodeWhisperer(editor)
    } else {
        fileContext = {
            filename: '',
            programmingLanguage: {
                languageName: '',
            },
            leftFileContent: '',
            rightFileContent: '',
        }
    }

    if (allowCodeWithReference === undefined) {
        return {
            fileContext: fileContext,
            nextToken: nextToken,
        }
    }
    return {
        fileContext: fileContext,
        nextToken: nextToken,
        referenceTrackerConfiguration: {
            recommendationsWithReferences: allowCodeWithReference ? 'ALLOW' : 'BLOCK',
        },
    }
}

export function buildGenerateRecommendationRequest(
    editor: vscode.TextEditor
): codewhispererClient.GenerateRecommendationsRequest {
    let req: codewhispererClient.GenerateRecommendationsRequest = {
        fileContext: {
            filename: '',
            programmingLanguage: {
                languageName: '',
            },
            leftFileContent: '',
            rightFileContent: '',
        },
        maxResults: CodeWhispererConstants.maxRecommendations,
    }
    if (editor !== undefined) {
        const fileContext = extractContextForCodeWhisperer(editor)
        req = {
            fileContext: fileContext,
            maxResults: CodeWhispererConstants.maxRecommendations,
        }
    }
    return req
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
