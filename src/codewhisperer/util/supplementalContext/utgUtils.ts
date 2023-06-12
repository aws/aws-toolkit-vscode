/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as glob from 'glob'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as codewhispererClient from '../../client/codewhisperer'
import * as vscode from 'vscode'
import { getRelevantFilesFromEditor } from './editorFilesUtil'
import {
    countSubstringMatches,
    extractClasses,
    extractFunctions,
    utgLanguageConfig,
    utgLanguageConfigs,
} from './codeParsingUtil'
import { DependencyGraph } from '../dependencyGraph/dependencyGraph'
import { ToolkitError } from '../../../shared/errors'
import { supplemetalContextFetchingTimeoutMsg } from '../../models/constants'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'

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
    dependencyGraph: DependencyGraph,
    cancellationToken: vscode.CancellationToken
): Promise<codewhispererClient.SupplementalContext[] | undefined> {
    // TODO: Add metrices
    // 1. Total number of calls to fetchSupplementalContextForTest
    // 2. Success count for fetchSourceFileByName (find source file by name)
    // 3. Success count for fetchSourceFileByContent (find source file by content)
    // 4. Failure count - when unable to find focal file (supplemental context empty)

    const languageConfig = utgLanguageConfigs[editor.document.languageId]
    if (!languageConfig) {
        // This is required because we are launching this support for even smaller subset of
        // supported languages.
        // TODO: Add a metrics to see number of calls falling in this bucket.
        // TODO: Either catch this error upstream or here.
        return undefined
    }

    // TODO (Metrics): 1. Total number of calls to fetchSupplementalContextForTest
    throwIfCancelled(cancellationToken)

    let crossSourceFile = await findSourceFileByName(editor, languageConfig, dependencyGraph)
    if (crossSourceFile) {
        // TODO (Metrics): 2. Success count for fetchSourceFileByName (find source file by name)
        return generateSupplementalContextFromFocalFile(crossSourceFile, cancellationToken)
    }
    throwIfCancelled(cancellationToken)

    crossSourceFile = await findSourceFileByContent(editor, languageConfig, cancellationToken)
    if (crossSourceFile) {
        // TODO (Metrics): 3. Success count for fetchSourceFileByContent (find source file by content)
        return generateSupplementalContextFromFocalFile(crossSourceFile, cancellationToken)
    }

    // TODO (Metrics): 4. Failure count - when unable to find focal file (supplemental context empty)
    return []
}

function generateSupplementalContextFromFocalFile(
    filePath: string,
    cancellationToken: vscode.CancellationToken
): codewhispererClient.SupplementalContext[] {
    const supplementalContexts: codewhispererClient.SupplementalContext[] = []
    const fileContent = fs.readFileSync(vscode.Uri.file(filePath!).fsPath, 'utf-8')
    const segmentSize = 10200

    // TODO (Metrics) Publish fileContent.lenth to record the length of focal files observed.
    // We prepend the content with 'UTG' to inform the server side.
    const context = {
        filePath: filePath,
        content: 'UTG\n' + fileContent.slice(0, Math.min(fileContent.length, segmentSize)),
    } as codewhispererClient.SupplementalContext
    supplementalContexts.push(context)

    return supplementalContexts
}

async function findSourceFileByContent(
    editor: vscode.TextEditor,
    languageConfig: utgLanguageConfig,
    cancellationToken: vscode.CancellationToken
): Promise<string | undefined> {
    const testFileContent = fs.readFileSync(editor.document.fileName, 'utf-8')
    const testElementList = extractFunctions(testFileContent, languageConfig.functionExtractionPattern)
    testElementList.push(...extractClasses(editor.document.fileName, languageConfig.classExtractionPattern))
    let sourceFilePath: string | undefined = undefined
    let maxMatchCount = 0

    if (testElementList.length === 0) {
        // TODO: Add metrics here, as unable to parse test file using Regex.
        return sourceFilePath
    }

    const relevantFilePaths: vscode.Uri[] = await getRelevantFilesFromEditor(
        editor.document.fileName,
        editor.document.languageId
    )

    // TODO (Metrics):Add metrics for relevantFilePaths length
    relevantFilePaths.forEach(filePath => {
        throwIfCancelled(cancellationToken)

        const fileContent = fs.readFileSync(filePath.fsPath, 'utf-8')
        const elementList = extractFunctions(fileContent, languageConfig.functionExtractionPattern)
        elementList.push(...extractClasses(fileContent, languageConfig.classExtractionPattern))
        const matchCount = countSubstringMatches(elementList, testElementList)
        if (matchCount > maxMatchCount) {
            maxMatchCount = matchCount
            sourceFilePath = filePath.fsPath
        }
    })
    return sourceFilePath
}

async function findSourceFileByName(
    editor: vscode.TextEditor,
    languageConfig: utgLanguageConfig,
    dependencyGraph: DependencyGraph
): Promise<string | undefined> {
    const uri = dependencyGraph.getRootFile(editor)
    const projectPath = dependencyGraph.getProjectPath(uri)
    const testFileName = path.basename(editor.document.fileName)

    let basenameSuffix = testFileName
    const match = testFileName.match(languageConfig.testFilenamePattern)
    if (match) {
        basenameSuffix = match[1] || match[2]
    }

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
    if (fs.existsSync(newPath)) {
        return newPath
    }

    // TODO: vscode.workspace.findFiles is preferred but doesn't seems to be working for now.
    // TODO: Enable this later.
    //const sourceFiles =
    //    await vscode.workspace.findFiles(`${projectPath}/**/${basenameSuffix}${languageConfig.extension}`);
    const sourceFiles = await globPromise(`${projectPath}/**/${basenameSuffix}${languageConfig.extension}`)

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
