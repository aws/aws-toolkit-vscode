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
import { collectFiles } from '../../amazonqFeatureDev/util/files'

export interface ZipMetadata {
    rootDir: string
    zipFilePath: string
    scannedFiles: Set<string>
    srcPayloadSizeInBytes: number
    buildPayloadSizeInBytes: number
    zipFileSizeInBytes: number
    lines: number
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

    constructor() {}

    getFileScanPayloadSizeLimitInBytes(): number {
        return CodeWhispererConstants.fileScanPayloadSizeLimitBytes
    }

    getProjectScanPayloadSizeLimitInBytes(): number {
        return CodeWhispererConstants.projectScanPayloadSizeLimitBytes
    }

    public getProjectName(uri: vscode.Uri) {
        const projectPath = this.getProjectPath(uri)
        return path.basename(projectPath)
    }

    public getProjectPath(uri: vscode.Uri) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
        if (workspaceFolder === undefined) {
            return this.getBaseDirPath(uri)
        }
        return workspaceFolder.uri.fsPath
    }

    protected getBaseDirPath(uri: vscode.Uri) {
        return path.dirname(uri.fsPath)
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

    protected async zipFile(uri: vscode.Uri) {
        const zip = new admZip()

        const content = await this.getTextContent(uri)

        zip.addFile(this.getZipPath(uri), Buffer.from(content, 'utf-8'))

        this._pickedSourceFiles.add(uri.fsPath)
        this._totalSize += (await fsCommon.stat(uri.fsPath)).size
        this._totalLines += content.split(ZipConstants.newlineRegex).length

        if (this.reachSizeLimit(this._totalSize, CodeWhispererConstants.CodeAnalysisScope.FILE)) {
            throw new ToolkitError('Payload size limit reached.')
        }

        const zipFilePath = this.getZipDirPath() + CodeWhispererConstants.codeScanZipExt
        zip.writeZip(zipFilePath)
        return zipFilePath
    }

    protected async zipProject(uri: vscode.Uri) {
        const zip = new admZip()

        const projectPath = this.getProjectPath(uri)
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
        if (!workspaceFolder) {
            throw Error('No workspace folder found')
        }

        const files = await collectFiles([projectPath], [workspaceFolder])
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
                    throw new ToolkitError('Payload size limit reached.')
                }
                this._pickedSourceFiles.add(file.fileUri.fsPath)
                this._totalSize += fileSize
                this._totalLines += fileContent.split(ZipConstants.newlineRegex).length
            }

            if (isFileOpenAndDirty) {
                zip.addFile(this.getZipPath(file.fileUri), Buffer.from(fileContent, 'utf-8'))
            } else {
                zip.addLocalFile(file.fileUri.fsPath, path.dirname(this.getZipPath(file.fileUri)))
            }
        }

        const zipFilePath = this.getZipDirPath() + CodeWhispererConstants.codeScanZipExt
        zip.writeZip(zipFilePath)
        return zipFilePath
    }

    protected isFileOpenAndDirty(uri: vscode.Uri) {
        return vscode.workspace.textDocuments.some(document => document.uri.fsPath === uri.fsPath && document.isDirty)
    }

    protected getZipPath(uri: vscode.Uri) {
        const projectName = this.getProjectName(uri)
        const relativePath = vscode.workspace.asRelativePath(uri)
        return path.join(projectName, relativePath)
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

    public async generateZip(uri: vscode.Uri, scope: CodeWhispererConstants.CodeAnalysisScope): Promise<ZipMetadata> {
        try {
            const zipDirPath = this.getZipDirPath()
            let zipFilePath: string
            if (scope === CodeWhispererConstants.CodeAnalysisScope.FILE) {
                zipFilePath = await this.zipFile(uri)
            } else if (scope === CodeWhispererConstants.CodeAnalysisScope.PROJECT) {
                zipFilePath = await this.zipProject(uri)
            } else {
                throw new ToolkitError(`Unknown code analysis scope: ${scope}`)
            }

            getLogger().debug(`Picked source files: [${[...this._pickedSourceFiles].join(', ')}]`)
            const zipFileSize = (await fsCommon.stat(zipFilePath)).size
            return {
                rootDir: zipDirPath,
                zipFilePath: zipFilePath,
                srcPayloadSizeInBytes: this._totalSize,
                scannedFiles: new Set([...this._pickedSourceFiles, ...this._pickedBuildFiles]),
                zipFileSizeInBytes: zipFileSize,
                buildPayloadSizeInBytes: this._totalBuildSize,
                lines: this._totalLines,
            }
        } catch (error) {
            getLogger().error('Zip error caused by:', error)
            throw error
        }
    }

    public async removeTmpFiles(zipMetadata: ZipMetadata) {
        getLogger().verbose(`Cleaning up temporary files...`)
        await fsCommon.delete(zipMetadata.zipFilePath)
        await fsCommon.delete(zipMetadata.rootDir)
        getLogger().verbose(`Complete cleaning up temporary files.`)
    }
}
