/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import glob from 'glob'
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
import { fsCommon } from '../../../srcShared/fs'

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
            supplementalContextItems: await generateSupplementalContextFromFocalFile(
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
            supplementalContextItems: await generateSupplementalContextFromFocalFile(
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

async function generateSupplementalContextFromFocalFile(
    filePath: string,
    strategy: UtgStrategy,
    cancellationToken: vscode.CancellationToken
): Promise<CodeWhispererSupplementalContextItem[]> {
    const fileContent = await fsCommon.readFileAsString(vscode.Uri.file(filePath!).fsPath)

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
    const testFileContent = await fsCommon.readFileAsString(editor.document.fileName)
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
    for (const fp of relevantFilePaths) {
        throwIfCancelled(cancellationToken)

        const fileContent = await fsCommon.readFileAsString(fp)
        const elementList = extractFunctions(fileContent, languageConfig.functionExtractionPattern)
        elementList.push(...extractClasses(fileContent, languageConfig.classExtractionPattern))
        const matchCount = countSubstringMatches(elementList, testElementList)
        if (matchCount > maxMatchCount) {
            maxMatchCount = matchCount
            sourceFilePath = fp
        }
    }
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

async function findSourceFileByName(
    editor: vscode.TextEditor,
    languageConfig: utgLanguageConfig,
    cancellationToken: vscode.CancellationToken
): Promise<string | undefined> {
    const uri = editor.document.uri
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
    const projectPath = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(uri.fsPath)
    const testFileName = path.basename(editor.document.fileName)

    let basenameSuffix = testFileName
    const match = testFileName.match(languageConfig.testFilenamePattern)
    if (match) {
        basenameSuffix = match[1] || match[2]
    }

    throwIfCancelled(cancellationToken)

    // Assuming the convention of using similar path structure for test and src files.
    const dirPath = path.dirname(editor.document.uri.fsPath)
    let newPath = ''
    const lastIndexTest = dirPath.lastIndexOf('/test/')
    const lastIndexTst = dirPath.lastIndexOf('/tst/')
    // This is a faster way on the assumption that source file and test file will follow similar path structure.
    if (lastIndexTest > 0) {
        newPath = dirPath.substring(0, lastIndexTest) + '/src/' + dirPath.substring(lastIndexTest + 5)
    } else if (lastIndexTst > 0) {
        newPath = dirPath.substring(0, lastIndexTst) + '/src/' + dirPath.substring(lastIndexTst + 4)
    }
    newPath = path.join(newPath, basenameSuffix + languageConfig.extension)
    // TODO: Add metrics here, as we are not able to find the source file by name.
    if (await fsCommon.exists(newPath)) {
        return newPath
    }

    throwIfCancelled(cancellationToken)

    // TODO: vscode.workspace.findFiles is preferred but doesn't seems to be working for now.
    // TODO: Enable this later.
    //const sourceFiles =
    //    await vscode.workspace.findFiles(`${projectPath}/**/${basenameSuffix}${languageConfig.extension}`);
    const sourceFiles = await globPromise(`${projectPath}/**/${basenameSuffix}${languageConfig.extension}`)

    throwIfCancelled(cancellationToken)

    if (sourceFiles.length > 0) {
        return sourceFiles[0]
    }
    return undefined
}

// TODO: Replace this by vscode.workspace.findFiles
function globPromise(pattern: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        glob(pattern, (err, files) => {
            if (err) {
                reject(err)
            } else {
                resolve(files)
            }
        })
    })
}

function throwIfCancelled(token: vscode.CancellationToken): void | never {
    if (token.isCancellationRequested) {
        throw new ToolkitError(supplemetalContextFetchingTimeoutMsg, { cause: new CancellationError('timeout') })
    }
}
