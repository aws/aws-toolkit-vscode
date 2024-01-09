/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { SystemUtilities } from '../../shared/systemUtilities'
import { getGlobDirExcludedPatterns } from '../../shared/fs/watchedFiles'
import { getWorkspaceRelativePath } from '../../shared/utilities/workspaceUtils'
import { Uri } from 'vscode'
import { GitIgnoreFilter } from './gitignore'

import AdmZip from 'adm-zip'
import { fsCommon } from '../../srcShared/fs'
import { TelemetryHelper } from './telemetryHelper'
import { PrepareRepoFailedError } from '../errors'
import { getLogger } from '../../shared/logger/logger'
import { maxFileSizeBytes } from '../limits'
import { createHash } from 'crypto'

import { AmazonqCreateUpload, Metric } from '../../shared/telemetry/telemetry'

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
        '**/license.txt',
        '**/License.txt',
        '**/LICENSE.txt',
        '**/license.md',
        '**/License.md',
        '**/LICENSE.md',
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

// TODO: remove any
export async function collectFiles(rootPath: string, respectGitIgnore: boolean = true): Promise<any[]> {
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

const getSha256 = (file: Buffer) => createHash('sha256').update(file).digest('base64')

/**
 * given the root path of the repo it zips its files in memory and generates a checksum for it.
 */
export async function prepareRepoData(
    repoRootPath: string,
    telemetry: TelemetryHelper,
    span: Metric<AmazonqCreateUpload>
) {
    try {
        const zip = new AdmZip()

        const allFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(repoRootPath, '**'),
            getExcludePattern()
        )

        const files = await filterOutGitignoredFiles(repoRootPath, allFiles)
        let totalBytes = 0
        for (const file of files) {
            const fileSize = (await vscode.workspace.fs.stat(vscode.Uri.file(file.fsPath))).size
            if (fileSize >= maxFileSizeBytes) {
                continue
            }
            totalBytes += fileSize

            const relativePath = getWorkspaceRelativePath(file.fsPath)
            const zipFolderPath = relativePath ? path.dirname(relativePath) : ''
            try {
                await SystemUtilities.readFile(file, new TextDecoder('utf8', { fatal: true }))
                zip.addLocalFile(file.fsPath, zipFolderPath)
            } catch (error) {
                getLogger().debug(
                    `featureDev: Failed to read file ${file.fsPath} when collecting repository: ${error}. Skipping the file`
                )
            }
        }

        telemetry.setRepositorySize(totalBytes)
        span.record({ amazonqRepositorySize: totalBytes })

        const zipFileBuffer = zip.toBuffer()
        return {
            zipFileBuffer,
            zipFileChecksum: getSha256(zipFileBuffer),
        }
    } catch (error) {
        getLogger().debug(`featureDev: Failed to prepare repo: ${error}`)
        throw new PrepareRepoFailedError()
    }
}

export async function getSourceCodePath(workspaceRoot: string, projectRoot: string) {
    const srcRoot = path.join(workspaceRoot, projectRoot)
    return (await fsCommon.directoryExists(srcRoot)) ? srcRoot : workspaceRoot
}
