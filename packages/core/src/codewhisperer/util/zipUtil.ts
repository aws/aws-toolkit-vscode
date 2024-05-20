/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import admZip from 'adm-zip'
import * as vscode from 'vscode'
import path from 'path'
import { tempDirPath } from '../../shared/filesystemUtilities'
import { getLogger } from '../../shared/logger'
import * as CodeWhispererConstants from '../models/constants'
import { ToolkitError } from '../../shared/errors'
import { fsCommon } from '../../srcShared/fs'
import { getLoggerForScope } from '../service/securityScanHandler'
import { runtimeLanguageContext } from './runtimeLanguageContext'
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import { CurrentWsFolders, collectFiles } from '../../shared/utilities/workspaceUtils'
import {
    FileSizeExceededError,
    InvalidSourceFilesError,
    NoWorkspaceFolderFoundError,
    ProjectSizeExceededError,
} from '../models/errors'

export interface ZipMetadata {
    rootDir: string
    zipFilePath: string
    scannedFiles: Set<string>
    srcPayloadSizeInBytes: number
    buildPayloadSizeInBytes: number
    zipFileSizeInBytes: number
    lines: number
    language: CodewhispererLanguage | undefined
}

export const ZipConstants = {
    newlineRegex: /\r?\n/,
    gitignoreFilename: '.gitignore',
    javaBuildExt: '.class',
}

export class ZipUtil {
    protected _pickedSourceFiles: Set<string> = new Set<string>()
    protected _pickedBuildFiles: Set<string> = new Set<string>()
    protected _totalSize: number = 0
    protected _totalBuildSize: number = 0
    protected _tmpDir: string = tempDirPath
    protected _zipDir: string = ''
    protected _totalLines: number = 0
    protected _fetchedDirs: Set<string> = new Set<string>()
    protected _language: CodewhispererLanguage | undefined

    constructor() {}

    getFileScanPayloadSizeLimitInBytes(): number {
        return CodeWhispererConstants.fileScanPayloadSizeLimitBytes
    }

    getProjectScanPayloadSizeLimitInBytes(): number {
        return CodeWhispererConstants.projectScanPayloadSizeLimitBytes
    }

    public getProjectPaths() {
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new NoWorkspaceFolderFoundError()
        }
        return workspaceFolders.map(folder => folder.uri.fsPath)
    }

    protected async getTextContent(uri: vscode.Uri) {
        const document = await vscode.workspace.openTextDocument(uri)
        const content = document.getText()
        return content
    }

    public isJavaClassFile(uri: vscode.Uri) {
        return uri.fsPath.endsWith(ZipConstants.javaBuildExt)
    }

    public reachSizeLimit(size: number, scope: CodeWhispererConstants.CodeAnalysisScope): boolean {
        if (scope === CodeWhispererConstants.CodeAnalysisScope.FILE) {
            return size > this.getFileScanPayloadSizeLimitInBytes()
        } else {
            return size > this.getProjectScanPayloadSizeLimitInBytes()
        }
    }

    public willReachSizeLimit(current: number, adding: number): boolean {
        const willReachLimit = current + adding > this.getProjectScanPayloadSizeLimitInBytes()
        return willReachLimit
    }

    protected async zipFile(uri: vscode.Uri | undefined) {
        if (!uri) {
            throw Error('Uri is undefined')
        }
        const zip = new admZip()

        const content = await this.getTextContent(uri)

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
        if (!workspaceFolder) {
            throw Error('No workspace folder found')
        }
        const projectName = workspaceFolder.name
        const relativePath = vscode.workspace.asRelativePath(uri)
        const zipEntryPath = this.getZipEntryPath(projectName, relativePath)
        zip.addFile(zipEntryPath, Buffer.from(content, 'utf-8'))

        this._pickedSourceFiles.add(uri.fsPath)
        this._totalSize += (await fsCommon.stat(uri.fsPath)).size
        this._totalLines += content.split(ZipConstants.newlineRegex).length

        if (this.reachSizeLimit(this._totalSize, CodeWhispererConstants.CodeAnalysisScope.FILE)) {
            throw new FileSizeExceededError()
        }

        const zipFilePath = this.getZipDirPath() + CodeWhispererConstants.codeScanZipExt
        zip.writeZip(zipFilePath)
        return zipFilePath
    }

    protected getZipEntryPath(projectName: string, relativePath: string) {
        // Workspaces with multiple folders have the folder names as the root folder,
        // but workspaces with only a single folder don't. So prepend the workspace folder name
        // if it is not present.
        return relativePath.split('/').shift() === projectName ? relativePath : path.join(projectName, relativePath)
    }

    protected async zipProject() {
        const zip = new admZip()

        const projectPaths = this.getProjectPaths()

        const files = await collectFiles(
            projectPaths,
            vscode.workspace.workspaceFolders as CurrentWsFolders,
            true,
            CodeWhispererConstants.projectScanPayloadSizeLimitBytes
        )
        const languageCount = new Map<CodewhispererLanguage, number>()
        for (const file of files) {
            const isFileOpenAndDirty = this.isFileOpenAndDirty(file.fileUri)
            const fileContent = isFileOpenAndDirty ? await this.getTextContent(file.fileUri) : file.fileContent

            const fileSize = Buffer.from(fileContent).length
            if (this.isJavaClassFile(file.fileUri)) {
                this._pickedBuildFiles.add(file.fileUri.fsPath)
                this._totalBuildSize += fileSize
            } else {
                if (
                    this.reachSizeLimit(this._totalSize, CodeWhispererConstants.CodeAnalysisScope.PROJECT) ||
                    this.willReachSizeLimit(this._totalSize, fileSize)
                ) {
                    throw new ProjectSizeExceededError()
                }
                this._pickedSourceFiles.add(file.fileUri.fsPath)
                this._totalSize += fileSize
                this._totalLines += fileContent.split(ZipConstants.newlineRegex).length

                const fileExtension = path.extname(file.fileUri.fsPath).slice(1)
                const language = runtimeLanguageContext.getLanguageFromFileExtension(fileExtension)
                if (language && language !== 'plaintext') {
                    languageCount.set(language, (languageCount.get(language) || 0) + 1)
                }
            }

            const zipEntryPath = this.getZipEntryPath(file.workspaceFolder.name, file.zipFilePath)

            if (isFileOpenAndDirty) {
                zip.addFile(zipEntryPath, Buffer.from(fileContent, 'utf-8'))
            } else {
                zip.addLocalFile(file.fileUri.fsPath, path.dirname(zipEntryPath))
            }
        }

        if (languageCount.size === 0) {
            throw new InvalidSourceFilesError()
        }
        this._language = [...languageCount.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
        const zipFilePath = this.getZipDirPath() + CodeWhispererConstants.codeScanZipExt
        zip.writeZip(zipFilePath)
        return zipFilePath
    }

    protected isFileOpenAndDirty(uri: vscode.Uri) {
        return vscode.workspace.textDocuments.some(document => document.uri.fsPath === uri.fsPath && document.isDirty)
    }

    protected getZipDirPath(): string {
        if (this._zipDir === '') {
            this._zipDir = path.join(
                this._tmpDir,
                CodeWhispererConstants.codeScanTruncDirPrefix + '_' + Date.now().toString()
            )
        }
        return this._zipDir
    }

    public async generateZip(
        uri: vscode.Uri | undefined,
        scope: CodeWhispererConstants.CodeAnalysisScope
    ): Promise<ZipMetadata> {
        try {
            const zipDirPath = this.getZipDirPath()
            let zipFilePath: string
            if (scope === CodeWhispererConstants.CodeAnalysisScope.FILE) {
                zipFilePath = await this.zipFile(uri)
            } else if (scope === CodeWhispererConstants.CodeAnalysisScope.PROJECT) {
                zipFilePath = await this.zipProject()
            } else {
                throw new ToolkitError(`Unknown code analysis scope: ${scope}`)
            }

            getLoggerForScope(scope).debug(`Picked source files: [${[...this._pickedSourceFiles].join(', ')}]`)
            const zipFileSize = (await fsCommon.stat(zipFilePath)).size
            return {
                rootDir: zipDirPath,
                zipFilePath: zipFilePath,
                srcPayloadSizeInBytes: this._totalSize,
                scannedFiles: new Set([...this._pickedSourceFiles, ...this._pickedBuildFiles]),
                zipFileSizeInBytes: zipFileSize,
                buildPayloadSizeInBytes: this._totalBuildSize,
                lines: this._totalLines,
                language: this._language,
            }
        } catch (error) {
            getLogger().error('Zip error caused by:', error)
            throw error
        }
    }

    public async removeTmpFiles(zipMetadata: ZipMetadata, scope: CodeWhispererConstants.CodeAnalysisScope) {
        const logger = getLoggerForScope(scope)
        logger.verbose(`Cleaning up temporary files...`)
        await fsCommon.delete(zipMetadata.zipFilePath)
        await fsCommon.delete(zipMetadata.rootDir)
        logger.verbose(`Complete cleaning up temporary files.`)
    }
}
