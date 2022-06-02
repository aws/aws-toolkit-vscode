/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as consolasClient from '../client/consolas'
import * as path from 'path'
import { ConsolasConstants } from '../models/constants'
import { getTabSizeSetting } from '../../../shared/utilities/editorUtilities'
import { runtimeLanguageContext } from '../../../vector/consolas/util/runtimeLanguageContext'
import { UnsupportedLanguagesCache } from './unsupportedLanguagesCache'
import { TelemetryHelper } from './telemetryHelper'
import { getLogger } from '../../../shared/logger/logger'

let tabSize: number = getTabSizeSetting()
export function extractContextForConsolas(editor: vscode.TextEditor): consolasClient.ConsolasFileContext {
    let editorFileContext: consolasClient.ConsolasFileContext = {
        leftFileContent: '',
        rightFileContent: '',
    }
    const document = editor.document
    const curPos = editor.selection.active
    const offset = document.offsetAt(curPos)
    TelemetryHelper.instance.cursorOffset = offset

    const caretLeftFileContext = editor.document.getText(
        new vscode.Range(document.positionAt(offset - ConsolasConstants.charactersLimit), document.positionAt(offset))
    )

    const caretRightFileContext = editor.document.getText(
        new vscode.Range(document.positionAt(offset), document.positionAt(offset + ConsolasConstants.charactersLimit))
    )

    editorFileContext = {
        leftFileContent: caretLeftFileContext,
        rightFileContent: caretRightFileContext,
    }
    return editorFileContext
}

export function getFileName(editor: vscode.TextEditor): string {
    if (editor !== undefined) {
        const fileName = path.basename(editor.document.fileName)
        return fileName.substring(0, ConsolasConstants.filenameCharsLimit)
    }
    return ''
}

export function getProgrammingLanguage(editor: vscode.TextEditor | undefined): consolasClient.ConsolasProgLang {
    let programmingLanguage: consolasClient.ConsolasProgLang = {
        languageName: '',
        runtimeVersion: '',
    }
    if (editor !== undefined) {
        const languageId = editor?.document?.languageId
        const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
        programmingLanguage = {
            languageName: languageContext.language,
            runtimeVersion: languageContext.runtimeLanguageSource,
        }
    }
    return programmingLanguage
}

export function buildListRecommendationRequest(
    editor: vscode.TextEditor,
    nextToken: string
): consolasClient.ListRecommendationsRequest {
    let req: consolasClient.ListRecommendationsRequest = {
        contextInfo: {
            filename: '',
            naturalLanguageCode: '',
            programmingLanguage: {
                languageName: '',
                runtimeVersion: '',
            },
        },
        fileContext: {
            leftFileContent: '',
            rightFileContent: '',
        },
        nextToken: '',
    }
    if (editor !== undefined) {
        const fileContext = extractContextForConsolas(editor)
        const fileName = getFileName(editor)
        const pLanguage = getProgrammingLanguage(editor)
        const contextInfo = {
            filename: fileName.toString(),
            naturalLanguageCode: ConsolasConstants.naturalLanguage,
            programmingLanguage: pLanguage,
        }
        req = {
            contextInfo: contextInfo,
            fileContext: fileContext,
            nextToken: nextToken,
        }
    }
    return req
}

export function buildGenerateRecommendationRequest(
    editor: vscode.TextEditor
): consolasClient.GenerateRecommendationsRequest {
    let req: consolasClient.GenerateRecommendationsRequest = {
        contextInfo: {
            filename: '',
            naturalLanguageCode: '',
            programmingLanguage: {
                languageName: '',
                runtimeVersion: '',
            },
        },
        fileContext: {
            leftFileContent: '',
            rightFileContent: '',
        },
        maxResults: ConsolasConstants.maxRecommendations,
        maxRecommendations: ConsolasConstants.maxRecommendations,
    }
    if (editor !== undefined) {
        const fileContext = extractContextForConsolas(editor)
        const fileName = getFileName(editor)
        const pLanguage = getProgrammingLanguage(editor)
        const contextInfo = {
            filename: fileName.toString(),
            naturalLanguageCode: ConsolasConstants.naturalLanguage,
            programmingLanguage: pLanguage,
        }
        req = {
            contextInfo: contextInfo,
            fileContext: fileContext,
            maxResults: ConsolasConstants.maxRecommendations,
            maxRecommendations: ConsolasConstants.maxRecommendations,
        }
    }
    return req
}

export function validateRequest(
    req: consolasClient.ListRecommendationsRequest | consolasClient.GenerateRecommendationsRequest
): boolean {
    const isRuntimeVersionValid = !(
        req.contextInfo.programmingLanguage.runtimeVersion == undefined ||
        req.contextInfo.programmingLanguage.runtimeVersion.length < 1 ||
        req.contextInfo.programmingLanguage.runtimeVersion.length > 128
    )
    const isLanguageNameValid = !(
        req.contextInfo.programmingLanguage.languageName == undefined ||
        req.contextInfo.programmingLanguage.languageName.length < 1 ||
        req.contextInfo.programmingLanguage.languageName.length > 128 ||
        UnsupportedLanguagesCache.isUnsupportedProgrammingLanguage(req.contextInfo.programmingLanguage.languageName)
    )
    const isFileNameValid = !(req.contextInfo.filename == undefined || req.contextInfo.filename.length < 1)

    const isNaturalLangaugeCodeValid = !(
        req.contextInfo.naturalLanguageCode == undefined ||
        req.contextInfo.naturalLanguageCode?.length < 2 ||
        req.contextInfo.naturalLanguageCode?.length > 5
    )
    const isFileContextValid = !(
        req.fileContext.leftFileContent.length > ConsolasConstants.charactersLimit ||
        req.fileContext.rightFileContent.length > ConsolasConstants.charactersLimit
    )

    if (
        isFileNameValid &&
        isLanguageNameValid &&
        isRuntimeVersionValid &&
        isNaturalLangaugeCodeValid &&
        isFileContextValid
    ) {
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
            if (lineText.length > ConsolasConstants.contextPreviewLen) {
                lineText =
                    '...' +
                    lineText.substring(lineText.length - ConsolasConstants.contextPreviewLen - 1, lineText.length - 1)
            }
        }
    } catch (error) {
        getLogger().error(`Error when getting left context ${error}`)
    }

    return lineText
}
