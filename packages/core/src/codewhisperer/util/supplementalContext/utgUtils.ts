/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { fs, waitUntil } from '../../../shared'
import * as vscode from 'vscode'
import {
    countSubstringMatches,
    extractClasses,
    extractFunctions,
    isTestFile,
    utgLanguageConfig,
    utgLanguageConfigs,
} from './codeParsingUtil'
import { supplementalContextTimeoutInMs, utgConfig } from '../../models/constants'
import { getOpenFilesInWindow } from '../../../shared/utilities/editorUtilities'
import { getLogger } from '../../../shared/logger/logger'
import { CodeWhispererSupplementalContext, CodeWhispererSupplementalContextItem, UtgStrategy } from '../../models/model'

const utgSupportedLanguages: vscode.TextDocument['languageId'][] = ['java', 'python']

type UtgSupportedLanguage = (typeof utgSupportedLanguages)[number]

function isUtgSupportedLanguage(languageId: vscode.TextDocument['languageId']): languageId is UtgSupportedLanguage {
    return utgSupportedLanguages.includes(languageId)
}

export function shouldFetchUtgContext(languageId: vscode.TextDocument['languageId']): boolean | undefined {
    if (!isUtgSupportedLanguage(languageId)) {
        return undefined
    }

    return languageId === 'java'
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
    editor: vscode.TextEditor
): Promise<Pick<CodeWhispererSupplementalContext, 'supplementalContextItems' | 'strategy'> | undefined> {
    const shouldProceed = shouldFetchUtgContext(editor.document.languageId)

    if (!shouldProceed) {
        return shouldProceed === undefined ? undefined : { supplementalContextItems: [], strategy: 'empty' }
    }

    const languageConfig = utgLanguageConfigs[editor.document.languageId]

    const utgContext: Pick<CodeWhispererSupplementalContext, 'supplementalContextItems' | 'strategy'> | undefined =
        await waitUntil(
            async function () {
                let crossSourceFile = await findSourceFileByName(editor)
                if (crossSourceFile) {
                    getLogger().debug(`CodeWhisperer finished fetching utg context by file name`)
                    return {
                        supplementalContextItems: await generateSupplementalContextFromFocalFile(
                            crossSourceFile,
                            'byName'
                        ),
                        strategy: 'byName',
                    }
                }

                crossSourceFile = await findSourceFileByContent(editor, languageConfig)
                if (crossSourceFile) {
                    getLogger().debug(`CodeWhisperer finished fetching utg context by file content`)
                    return {
                        supplementalContextItems: await generateSupplementalContextFromFocalFile(
                            crossSourceFile,
                            'byContent'
                        ),
                        strategy: 'byContent',
                    }
                }

                return undefined
            },
            { timeout: supplementalContextTimeoutInMs, interval: 5, truthy: false }
        )

    if (!utgContext) {
        getLogger().debug(`CodeWhisperer failed to fetch utg context`)
    }

    return (
        utgContext ?? {
            supplementalContextItems: [],
            strategy: 'empty',
        }
    )
}

async function generateSupplementalContextFromFocalFile(
    filePath: string,
    strategy: UtgStrategy
): Promise<CodeWhispererSupplementalContextItem[]> {
    const fileContent = await fs.readFileText(vscode.Uri.parse(filePath!).fsPath)

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
    languageConfig: utgLanguageConfig
): Promise<string | undefined> {
    const testFileContent = await fs.readFileText(editor.document.fileName)
    const testElementList = extractFunctions(testFileContent, languageConfig.functionExtractionPattern)

    testElementList.push(...extractClasses(testFileContent, languageConfig.classExtractionPattern))

    let sourceFilePath: string | undefined = undefined
    let maxMatchCount = 0

    if (testElementList.length === 0) {
        return sourceFilePath
    }

    const relevantFilePaths = await getRelevantUtgFiles(editor)

    for (const filePath of relevantFilePaths) {
        const fileContent = await fs.readFileText(filePath)
        const elementList = extractFunctions(fileContent, languageConfig.functionExtractionPattern)
        elementList.push(...extractClasses(fileContent, languageConfig.classExtractionPattern))
        const matchCount = countSubstringMatches(elementList, testElementList)
        if (matchCount > maxMatchCount) {
            maxMatchCount = matchCount
            sourceFilePath = filePath
        }
    }
    return sourceFilePath
}

async function getRelevantUtgFiles(editor: vscode.TextEditor): Promise<string[]> {
    const targetFile = editor.document.uri.fsPath
    const language = editor.document.languageId

    return await getOpenFilesInWindow(async (candidateFile) => {
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
                getLogger().error(
                    `codewhisperer: error while guessing source file name from file ${testFileName} and pattern ${pattern}: ${err.message}`
                )
            }
        }
    }

    return undefined
}

async function findSourceFileByName(editor: vscode.TextEditor): Promise<string | undefined> {
    const testFileName = path.basename(editor.document.fileName)
    const assumedSrcFileName = guessSrcFileName(testFileName, editor.document.languageId)
    if (!assumedSrcFileName) {
        return undefined
    }

    const sourceFiles = await vscode.workspace.findFiles(`**/${assumedSrcFileName}`)

    if (sourceFiles.length > 0) {
        return sourceFiles[0].toString()
    }
    return undefined
}
