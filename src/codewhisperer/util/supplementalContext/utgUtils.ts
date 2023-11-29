/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import {
    countSubstringMatches,
    extractClasses,
    extractFunctions,
    isTestFile,
    utgLanguageConfig,
    utgLanguageConfigs,
} from './codeParsingUtil'
import { ToolkitError } from '../../../shared/errors'
import { supplemetalContextFetchingTimeoutMsg } from '../../models/constants'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { utgConfig } from '../../models/constants'
import { CodeWhispererUserGroupSettings } from '../userGroupUtil'
import { UserGroup } from '../../models/constants'
import { getOpenFilesInWindow } from '../../../shared/utilities/editorUtilities'
import { getLogger } from '../../../shared/logger/logger'
import { CodeWhispererSupplementalContext, CodeWhispererSupplementalContextItem, UtgStrategy } from '../../models/model'

type UtgSupportedLanguage = keyof typeof utgLanguageConfigs

function isUtgSupportedLanguage(languageId: vscode.TextDocument['languageId']): languageId is UtgSupportedLanguage {
    return languageId in utgLanguageConfigs
}

export function shouldFetchUtgContext(
    languageId: vscode.TextDocument['languageId'],
    userGroup: UserGroup
): boolean | undefined {
    if (!isUtgSupportedLanguage(languageId)) {
        return undefined
    }

    if (languageId === 'java') {
        return true
    } else {
        return userGroup === UserGroup.CrossFile
    }
}

/**
 * This function attempts to find a focal file for the given trigger file.
 * Attempt 1: If naming patterns followed correctly, source file can be found by name referencing.
 * Attempt 2: Compare the function and class names of trigger file and all other open files in editor
 * to find the closest match.
 * Once found the focal file, we split it into multiple pieces as supplementalContext.
 * @param editor
 * @returns
 */
export async function fetchSupplementalContextForTest(
    editor: vscode.TextEditor,
    cancellationToken: vscode.CancellationToken
): Promise<Pick<CodeWhispererSupplementalContext, 'supplementalContextItems' | 'strategy'> | undefined> {
    const shouldProceed = shouldFetchUtgContext(
        editor.document.languageId,
        CodeWhispererUserGroupSettings.instance.userGroup
    )

    if (!shouldProceed) {
        return shouldProceed === undefined ? undefined : { supplementalContextItems: [], strategy: 'Empty' }
    }

    const languageConfig = utgLanguageConfigs[editor.document.languageId]

    // TODO (Metrics): 1. Total number of calls to fetchSupplementalContextForTest
    throwIfCancelled(cancellationToken)

    let crossSourceFile = await findSourceFileByName(editor, languageConfig, cancellationToken)
    if (crossSourceFile) {
        // TODO (Metrics): 2. Success count for fetchSourceFileByName (find source file by name)
        getLogger().debug(`CodeWhisperer finished fetching utg context by file name`)
        return {
            supplementalContextItems: generateSupplementalContextFromFocalFile(
                crossSourceFile,
                'ByName',
                cancellationToken
            ),
            strategy: 'ByName',
        }
    }
    throwIfCancelled(cancellationToken)

    crossSourceFile = await findSourceFileByContent(editor, languageConfig, cancellationToken)
    if (crossSourceFile) {
        // TODO (Metrics): 3. Success count for fetchSourceFileByContent (find source file by content)
        getLogger().debug(`CodeWhisperer finished fetching utg context by file content`)
        return {
            supplementalContextItems: generateSupplementalContextFromFocalFile(
                crossSourceFile,
                'ByContent',
                cancellationToken
            ),
            strategy: 'ByContent',
        }
    }

    // TODO (Metrics): 4. Failure count - when unable to find focal file (supplemental context empty)
    getLogger().debug(`CodeWhisperer failed to fetch utg context`)
    return {
        supplementalContextItems: [],
        strategy: 'Empty',
    }
}

function generateSupplementalContextFromFocalFile(
    filePath: string,
    strategy: UtgStrategy,
    cancellationToken: vscode.CancellationToken
): CodeWhispererSupplementalContextItem[] {
    const fileContent = fs.readFileSync(vscode.Uri.file(filePath!).fsPath, 'utf-8')

    // DO NOT send code chunk with empty content
    if (fileContent.trim().length === 0) {
        return []
    }

    return [
        {
            filePath: filePath,
            content: 'UTG\n' + fileContent.slice(0, Math.min(fileContent.length, utgConfig.maxSegmentSize)),
        },
    ]
}

async function findSourceFileByContent(
    editor: vscode.TextEditor,
    languageConfig: utgLanguageConfig,
    cancellationToken: vscode.CancellationToken
): Promise<string | undefined> {
    const testFileContent = fs.readFileSync(editor.document.fileName, 'utf-8')
    const testElementList = extractFunctions(testFileContent, languageConfig.functionExtractionPattern)

    throwIfCancelled(cancellationToken)

    testElementList.push(...extractClasses(editor.document.fileName, languageConfig.classExtractionPattern))

    throwIfCancelled(cancellationToken)

    let sourceFilePath: string | undefined = undefined
    let maxMatchCount = 0

    if (testElementList.length === 0) {
        // TODO: Add metrics here, as unable to parse test file using Regex.
        return sourceFilePath
    }

    const relevantFilePaths = await getRelevantUtgFiles(editor)

    throwIfCancelled(cancellationToken)

    // TODO (Metrics):Add metrics for relevantFilePaths length
    relevantFilePaths.forEach(filePath => {
        throwIfCancelled(cancellationToken)

        const fileContent = fs.readFileSync(filePath, 'utf-8')
        const elementList = extractFunctions(fileContent, languageConfig.functionExtractionPattern)
        elementList.push(...extractClasses(fileContent, languageConfig.classExtractionPattern))
        const matchCount = countSubstringMatches(elementList, testElementList)
        if (matchCount > maxMatchCount) {
            maxMatchCount = matchCount
            sourceFilePath = filePath
        }
    })
    return sourceFilePath
}

async function getRelevantUtgFiles(editor: vscode.TextEditor): Promise<string[]> {
    const targetFile = editor.document.uri.fsPath
    const language = editor.document.languageId

    return await getOpenFilesInWindow(async candidateFile => {
        return (
            targetFile !== candidateFile &&
            path.extname(targetFile) === path.extname(candidateFile) &&
            !(await isTestFile(candidateFile, { languageId: language }))
        )
    })
}

export function guessSrcFileName(
    testFileName: string,
    languageId: vscode.TextDocument['languageId']
): string | undefined {
    const languageConfig = utgLanguageConfigs[languageId]
    if (!languageConfig) {
        return undefined
    }

    for (const pattern of languageConfig.testFilenamePattern) {
        try {
            const match = testFileName.match(pattern)
            if (match) {
                return match[1] + match[2]
            }
        } catch (err) {
            if (err instanceof Error) {
                getLogger().debug(
                    `codewhisperer: error while guessing source file name from file ${testFileName} and pattern ${pattern}: ${err.message}`
                )
            }
        }
    }

    return undefined
}

async function findSourceFileByName(
    editor: vscode.TextEditor,
    languageConfig: utgLanguageConfig,
    cancellationToken: vscode.CancellationToken
): Promise<string | undefined> {
    const filePath = editor.document.uri.fsPath

    const testFileName = path.basename(editor.document.fileName)
    const sourceFileName = guessSrcFileName(testFileName, editor.document.languageId)

    if (!sourceFileName) {
        return undefined
    }

    const folders = vscode.workspace.workspaceFolders

    if (folders) {
        try {
            for (const folder of folders) {
                if (!filePath.includes(`${folder.name}/`)) {
                    continue
                }

                const pattern = new vscode.RelativePattern(folder, `**/${sourceFileName}`)
                const myFiles = await vscode.workspace.findFiles(pattern)
                if (myFiles) {
                    return myFiles[0].fsPath
                }
            }
        } catch (err) {
            getLogger().debug(
                `codewhisperer: UTG running into error while searching file ${sourceFileName}, errorMessage: ${err}`
            )
        }

        return undefined
    }

    return undefined
}

function throwIfCancelled(token: vscode.CancellationToken): void | never {
    if (token.isCancellationRequested) {
        throw new ToolkitError(supplemetalContextFetchingTimeoutMsg, { cause: new CancellationError('timeout') })
    }
}
