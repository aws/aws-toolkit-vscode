/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { FileMetadata } from '../client/weaverbirdclient'
import { SystemUtilities } from '../../shared/systemUtilities'
import { getGlobDirExcludedPatterns } from '../../shared/fs/watchedFiles'
import { getWorkspaceRelativePath } from '../../shared/utilities/workspaceUtils'
import { Uri } from 'vscode'
import { GitIgnoreFilter } from './gitignore'

import AdmZip from 'adm-zip'
import { FileSystemCommon } from '../../srcShared/fs'
import { getStringHash } from '../../shared/utilities/textUtilities'

export function getExcludePattern(additionalPatterns: string[] = []) {
    const globAlwaysExcludedDirs = getGlobDirExcludedPatterns().map(pattern => `**/${pattern}/*`)
    const extraPatterns = [
        '**/package-lock.json',
        '**/yarn.lock',
        '**/*.zip',
        '**/*.bin',
        '**/*.png',
        '**/*.jpg',
        '**/*.svg',
        '**/*.pyc',
    ]
    const allPatterns = [...globAlwaysExcludedDirs, ...extraPatterns, ...additionalPatterns]
    return `{${allPatterns.join(',')}}`
}

/**
 * @param rootPath root folder to look for .gitignore files
 * @returns list of glob patterns extracted from .gitignore
 * These patterns are compatible with vscode exclude patterns
 */
async function filterOutGitignoredFiles(rootPath: string, files: Uri[]): Promise<Uri[]> {
    const gitIgnoreFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(rootPath, '**/.gitignore'),
        getExcludePattern()
    )
    const gitIgnoreFilter = await GitIgnoreFilter.build(gitIgnoreFiles)
    return gitIgnoreFilter.filterFiles(files)
}

export async function collectFiles(rootPath: string, respectGitIgnore: boolean = true): Promise<FileMetadata[]> {
    const allFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(rootPath, '**'), getExcludePattern())
    const files = respectGitIgnore ? await filterOutGitignoredFiles(rootPath, allFiles) : allFiles

    const storage = []
    for (const file of files) {
        const fileContent = await SystemUtilities.readFile(file)
        const relativePath = getWorkspaceRelativePath(file.fsPath)

        if (relativePath) {
            storage.push({
                // The LLM doesn't need absolute paths, only relative from the project
                filePath: relativePath,
                fileContent: fileContent,
            })
        }
    }
    return storage
}

/**
 * given the root path of the repo it zips its files in memory and generates a checksum for it.
 */
export async function prepareRepoData(repoRootPath: string) {
    const zip = new AdmZip()

    const allFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(repoRootPath, '**'),
        getExcludePattern()
    )
    const files = await filterOutGitignoredFiles(repoRootPath, allFiles)
    for (const file of files) {
        const relativePath = getWorkspaceRelativePath(file.fsPath)
        const zipFolderPath = relativePath ? path.dirname(relativePath) : ''
        zip.addLocalFile(file.fsPath, zipFolderPath)
    }

    const zipFileBuffer = zip.toBuffer()
    return {
        zipFileBuffer,
        zipFileChecksum: getStringHash(zipFileBuffer),
    }
}

export async function getSourceCodePath(workspaceRoot: string, projectRoot: string) {
    const srcRoot = path.join(workspaceRoot, projectRoot)
    const srcFound = await FileSystemCommon.instance.stat(srcRoot)
    return srcFound !== undefined ? srcRoot : workspaceRoot
}
