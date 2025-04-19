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
import { checkLeftContextKeywordsForJson } from './commonUtil'
import { CodeWhispererSupplementalContext } from '../models/model'
import { getOptOutPreference } from '../../shared/telemetry/util'
import { indent } from '../../shared/utilities/textUtilities'
import { isInDirectory } from '../../shared/filesystemUtilities'
import { AuthUtil } from './authUtil'

let tabSize: number = getTabSizeSetting()

const languageCommentChars: Record<string, string> = {
    python: '# ',
    java: '// ',
}

export function extractSingleCellContext(cell: vscode.NotebookCell, referenceLanguage?: string): string {
    // Extract the text verbatim if the cell is code and the cell has the same language.
    // Otherwise, add the correct comment string for the refeference language
    const cellText = cell.document.getText()
    if (
        cell.kind === vscode.NotebookCellKind.Markup ||
        (runtimeLanguageContext.normalizeLanguage(cell.document.languageId) ?? cell.document.languageId) !==
            referenceLanguage
    ) {
        const commentPrefix = (referenceLanguage && languageCommentChars[referenceLanguage]) ?? ''
        if (commentPrefix === '') {
            return cellText
        }
        return cell.document
            .getText()
            .split('\n')
            .map((line) => `${commentPrefix}${line}`)
            .join('\n')
    }
    return cellText
}

export function extractCellsSliceContext(
    cells: vscode.NotebookCell[],
    maxLength: number,
    referenceLanguage: string,
    fromStart: boolean
): string {
    let output: string[] = []
    if (!fromStart) {
        cells = cells.reverse()
    }
    cells.some((cell) => {
        let cellText = addNewlineIfMissing(extractSingleCellContext(cell, referenceLanguage))
        if (cellText.length > 0) {
            if (cellText.length >= maxLength) {
                if (fromStart) {
                    output.push(cellText.substring(0, maxLength))
                } else {
                    output.push(cellText.substring(cellText.length - maxLength))
                }
                return true
            }
            output.push(cellText)
            maxLength -= cellText.length
        }
    })
    if (!fromStart) {
        output = output.reverse()
    }
    return output.join('')
}

export function addNewlineIfMissing(text: string): string {
    if (text.length > 0 && !text.endsWith('\n')) {
        text += '\n'
    }
    return text
}

export function extractContextForCodeWhisperer(editor: vscode.TextEditor): codewhispererClient.FileContext {
    const document = editor.document
    const curPos = editor.selection.active
    const offset = document.offsetAt(curPos)

    let caretLeftFileContext = editor.document.getText(
        new vscode.Range(
            document.positionAt(offset - CodeWhispererConstants.charactersLimit),
            document.positionAt(offset)
        )
    )
    let caretRightFileContext = editor.document.getText(
        new vscode.Range(
            document.positionAt(offset),
            document.positionAt(offset + CodeWhispererConstants.charactersLimit)
        )
    )
    let languageName = 'plaintext'
    if (!checkLeftContextKeywordsForJson(document.fileName, caretLeftFileContext, editor.document.languageId)) {
        languageName =
            runtimeLanguageContext.normalizeLanguage(editor.document.languageId) ?? editor.document.languageId
    }
    if (editor.document.uri.scheme === 'vscode-notebook-cell') {
        // For notebook cells, first find the existing notebook with a cell that matches the current editor.
        const notebook = vscode.workspace.notebookDocuments.find(
            (nb) =>
                nb.notebookType === 'jupyter-notebook' &&
                nb.getCells().some((cell) => cell.document === editor.document)
        )
        if (notebook) {
            const allCells = notebook.getCells()
            const cellIndex = allCells.findIndex((cell) => cell.document === editor.document)

            // Extract text from prior cells if there is enough room in left file context
            if (caretLeftFileContext.length < CodeWhispererConstants.charactersLimit - 1) {
                const leftCellsText = extractCellsSliceContext(
                    allCells.slice(0, cellIndex),
                    CodeWhispererConstants.charactersLimit - (caretLeftFileContext.length + 1),
                    languageName,
                    true
                )
                if (leftCellsText.length > 0) {
                    caretLeftFileContext = addNewlineIfMissing(leftCellsText) + caretLeftFileContext
                }
            }
            // Extract text from subsequent cells if there is enough room in right file context
            if (caretRightFileContext.length < CodeWhispererConstants.charactersLimit - 1) {
                const rightCellsText = extractCellsSliceContext(
                    allCells.slice(cellIndex + 1),
                    CodeWhispererConstants.charactersLimit - (caretRightFileContext.length + 1),
                    languageName,
                    false
                )
                if (rightCellsText.length > 0) {
                    caretRightFileContext = addNewlineIfMissing(caretRightFileContext) + rightCellsText
                }
            }
        }
    }

    return {
        filename: getFileRelativePath(editor),
        programmingLanguage: {
            languageName: languageName,
        },
        leftFileContent: caretLeftFileContext,
        rightFileContent: caretRightFileContext,
    } as codewhispererClient.FileContext
}

export function getFileName(editor: vscode.TextEditor): string {
    const fileName = path.basename(editor.document.fileName)
    return fileName.substring(0, CodeWhispererConstants.filenameCharsLimit)
}

export function getFileRelativePath(editor: vscode.TextEditor): string {
    const fileName = path.basename(editor.document.fileName)
    let relativePath = ''
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
    if (!workspaceFolder) {
        relativePath = fileName
    } else {
        const workspacePath = workspaceFolder.uri.fsPath
        const filePath = editor.document.uri.fsPath
        relativePath = path.relative(workspacePath, filePath)
    }
    // For notebook files, we want to use the programming language for each cell for the code suggestions, so change
    // the filename sent in the request to reflect that language
    if (relativePath.endsWith('.ipynb')) {
        const fileExtension = runtimeLanguageContext.getLanguageExtensionForNotebook(editor.document.languageId)
        if (fileExtension !== undefined) {
            const filenameWithNewExtension = relativePath.substring(0, relativePath.length - 5) + fileExtension
            return filenameWithNewExtension.substring(0, CodeWhispererConstants.filenameCharsLimit)
        }
    }
    return relativePath.substring(0, CodeWhispererConstants.filenameCharsLimit)
}

async function getWorkspaceId(editor: vscode.TextEditor): Promise<string | undefined> {
    try {
        const workspaceIds: { workspaces: { workspaceRoot: string; workspaceId: string }[] } =
            await vscode.commands.executeCommand('aws.amazonq.getWorkspaceId')
        for (const item of workspaceIds.workspaces) {
            const path = vscode.Uri.parse(item.workspaceRoot).fsPath
            if (isInDirectory(path, editor.document.uri.fsPath)) {
                return item.workspaceId
            }
        }
    } catch (err) {
        getLogger().warn(`No workspace id found ${err}`)
    }
    return undefined
}

export async function buildListRecommendationRequest(
    editor: vscode.TextEditor,
    nextToken: string,
    allowCodeWithReference: boolean
): Promise<{
    request: codewhispererClient.ListRecommendationsRequest
    supplementalMetadata: CodeWhispererSupplementalContext | undefined
}> {
    const fileContext = extractContextForCodeWhisperer(editor)

    const tokenSource = new vscode.CancellationTokenSource()
    setTimeout(() => {
        tokenSource.cancel()
    }, supplementalContextTimeoutInMs)

    const supplementalContexts = await fetchSupplementalContext(editor, tokenSource.token)

    logSupplementalContext(supplementalContexts)

    const selectedCustomization = getSelectedCustomization()
    const supplementalContext: codewhispererClient.SupplementalContext[] = supplementalContexts
        ? supplementalContexts.supplementalContextItems.map((v) => {
              return selectFrom(v, 'content', 'filePath')
          })
        : []

    const profile = AuthUtil.instance.regionProfileManager.activeRegionProfile

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
            workspaceId: await getWorkspaceId(editor),
            profileArn: profile?.arn,
        },
        supplementalMetadata: supplementalContexts,
    }
}

export async function buildGenerateRecommendationRequest(editor: vscode.TextEditor): Promise<{
    request: codewhispererClient.GenerateRecommendationsRequest
    supplementalMetadata: CodeWhispererSupplementalContext | undefined
}> {
    const fileContext = extractContextForCodeWhisperer(editor)

    const tokenSource = new vscode.CancellationTokenSource()
    // the supplement context fetch mechanisms each has a timeout of supplementalContextTimeoutInMs
    // adding 10 ms for overall timeout as buffer
    setTimeout(() => {
        tokenSource.cancel()
    }, supplementalContextTimeoutInMs + 10)
    const supplementalContexts = await fetchSupplementalContext(editor, tokenSource.token)

    logSupplementalContext(supplementalContexts)

    return {
        request: {
            fileContext: fileContext,
            maxResults: CodeWhispererConstants.maxRecommendations,
            supplementalContexts: supplementalContexts?.supplementalContextItems ?? [],
        },
        supplementalMetadata: supplementalContexts,
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

    let logString = indent(
        `CodeWhispererSupplementalContext:
        isUtg: ${supplementalContext.isUtg},
        isProcessTimeout: ${supplementalContext.isProcessTimeout},
        contentsLength: ${supplementalContext.contentsLength},
        latency: ${supplementalContext.latency}
        strategy: ${supplementalContext.strategy}`,
        4,
        true
    ).trimStart()

    for (const [index, context] of supplementalContext.supplementalContextItems.entries()) {
        logString += indent(`\nChunk ${index}:\n`, 4, true)
        logString += indent(
            `Path: ${context.filePath}
            Length: ${context.content.length}
            Score: ${context.score}`,
            8,
            true
        )
    }

    getLogger().debug(logString)
}
