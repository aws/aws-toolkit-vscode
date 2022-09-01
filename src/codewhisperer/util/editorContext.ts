/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as codewhispererClient from '../client/codewhisperer'
import * as path from 'path'
import { CodeWhispererConstants } from '../models/constants'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { TelemetryHelper } from './telemetryHelper'
import { getLogger } from '../../shared/logger/logger'

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
        filename: getFileName(editor),
        programmingLanguage: getProgrammingLanguage(editor),
        leftFileContent: caretLeftFileContext,
        rightFileContent: caretRightFileContext,
    } as codewhispererClient.FileContext
}

export function getFileName(editor: vscode.TextEditor): string {
    const fileName = path.basename(editor.document.fileName)
    return fileName.substring(0, CodeWhispererConstants.filenameCharsLimit)
}

export function getProgrammingLanguage(editor: vscode.TextEditor): codewhispererClient.ProgrammingLanguage {
    let languageId = editor.document.languageId
    switch (languageId) {
        case CodeWhispererConstants.typescript:
            languageId = CodeWhispererConstants.javascript
            break
        case CodeWhispererConstants.jsx:
            languageId = CodeWhispererConstants.javascript
            break
    }

    return {
        languageName: languageId,
    }
}

export function buildListRecommendationRequest(
    editor: vscode.TextEditor,
    nextToken: string
): codewhispererClient.ListRecommendationsRequest {
    let req: codewhispererClient.ListRecommendationsRequest = {
        fileContext: {
            filename: '',
            programmingLanguage: {
                languageName: '',
            },
            leftFileContent: '',
            rightFileContent: '',
        },
        nextToken: '',
    }
    if (editor !== undefined) {
        const fileContext = extractContextForCodeWhisperer(editor)
        req = {
            fileContext: fileContext,
            nextToken: nextToken,
        }
    }
    return req
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
        !CodeWhispererConstants.supportedLanguages.includes(req.fileContext.programmingLanguage.languageName)
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
