/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import path = require('path')
import { DependencyGraph } from '../dependencyGraph/dependencyGraph'
import { normalize } from '../../../shared/utilities/pathUtils'

export interface utgLanguageConfig {
    extension: string
    testFilenamePattern: RegExp
    functionExtractionPattern: RegExp
    classExtractionPattern: RegExp
    importStatementRegExp: RegExp
}

export const utgLanguageConfigs: Record<string, utgLanguageConfig> = {
    // Java regexes are not working efficiently for class or function extraction
    java: {
        extension: '.java',
        testFilenamePattern: /(?:Test([^/\\]+)\.java|([^/\\]+)Test\.java|([^/\\]+)Tests\.java)$/,
        functionExtractionPattern:
            /(?:(?:public|private|protected)\s+)(?:static\s+)?(?:[\w<>]+\s+)?(\w+)\s*\([^)]*\)\s*(?:(?:throws\s+\w+)?\s*)[{;]/gm, // TODO: Doesn't work for generice <T> T functions.
        classExtractionPattern: /(?<=^|\n)\s*public\s+class\s+(\w+)/gm, // TODO: Verify these.
        importStatementRegExp: /import .*\.([a-zA-Z0-9]+);/,
    },
    python: {
        extension: '.py',
        testFilenamePattern: /(?:test_([^/\\]+)\.py|([^/\\]+)_test\.py)$/,
        functionExtractionPattern: /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, // Worked fine
        classExtractionPattern: /^class\s+(\w+)\s*:/gm,
        importStatementRegExp: /from (.*) import.*/,
    },
}

export function extractFunctions(fileContent: string, regex: RegExp) {
    const functionNames: string[] = []
    let match: RegExpExecArray | null

    // eslint-disable-next-line no-null/no-null
    while ((match = regex.exec(fileContent)) !== null) {
        functionNames.push(match[1])
    }
    return functionNames
}

export function extractClasses(fileContent: string, regex: RegExp) {
    const classNames: string[] = []
    let match: RegExpExecArray | null

    // eslint-disable-next-line no-null/no-null
    while ((match = regex.exec(fileContent)) !== null) {
        classNames.push(match[1])
    }
    return classNames
}

export function countSubstringMatches(arr1: string[], arr2: string[]): number {
    let count = 0
    for (const str1 of arr1) {
        for (const str2 of arr2) {
            if (str2.toLowerCase().includes(str1.toLowerCase())) {
                count++
            }
        }
    }
    return count
}

export async function isTestFile(
    filePath: string,
    languageConfig: {
        languageId: vscode.TextDocument['languageId']
        dependencyGraph?: DependencyGraph
        fileContent?: string
    }
): Promise<boolean> {
    const normalizedFilePath = normalize(filePath)
    const pathContainsTest =
        normalizedFilePath.includes('tests/') ||
        normalizedFilePath.includes('test/') ||
        normalizedFilePath.includes('tst/')
    const fileNameMatchTestPatterns = isTestFileByName(normalizedFilePath, languageConfig.languageId)

    if (pathContainsTest || fileNameMatchTestPatterns) {
        return true
    }

    // This run slowly thus lazily execute
    const fileHasTestDependency =
        languageConfig.dependencyGraph && languageConfig.fileContent
            ? await languageConfig.dependencyGraph.isTestFile(languageConfig.fileContent)
            : false
    return fileHasTestDependency
}

function isTestFileByName(filePath: string, language: vscode.TextDocument['languageId']): boolean {
    const languageConfig = utgLanguageConfigs[language]
    if (!languageConfig) {
        // We have enabled the support only for python and Java for this check
        // as we depend on Regex for this validation.
        return false
    }
    const testFilenamePattern = languageConfig.testFilenamePattern

    const filename = path.basename(filePath)

    return testFilenamePattern.test(filename)
}
