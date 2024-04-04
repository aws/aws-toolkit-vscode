/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import path from 'path'
import { tempDirPath } from '../../shared/filesystemUtilities'
import { getLogger } from '../../shared/logger'
import * as CodeWhispererConstants from '../models/constants'
import { ToolkitError } from '../../shared/errors'
import { fsCommon } from '../../srcShared/fs'
import { collectFiles } from '../../amazonqFeatureDev/util/files'
import { ZipStream, ZipStreamResult } from '../../shared/utilities/zipStream'
import { WritableStreamBuffer } from 'stream-buffers'

export interface ZipMetadata {
    rootDir: string
    zipMd5: string
    zipStreamBuffer: WritableStreamBuffer
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

    public reachSizeLimit(size: number, scanType: CodeWhispererConstants.SecurityScanType): boolean {
        if (scanType === CodeWhispererConstants.SecurityScanType.File) {
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
        const zipStream = new ZipStream()

        const projectName = this.getProjectName(uri)
        const relativePath = vscode.workspace.asRelativePath(uri)

        const content = await this.getTextContent(uri)

        zipStream.writeString(content, path.join(projectName, relativePath))

        this._pickedSourceFiles.add(relativePath)
        this._totalSize += (await fsCommon.stat(uri.fsPath)).size
        this._totalLines += content.split(ZipConstants.newlineRegex).length

        if (this.reachSizeLimit(this._totalSize, CodeWhispererConstants.SecurityScanType.File)) {
            throw new ToolkitError('Payload size limit reached.')
        }

        return zipStream.finalize()
    }

    protected async zipProject(uri: vscode.Uri) {
        const zipStream = new ZipStream()

        const projectName = this.getProjectName(uri)
        const projectPath = this.getProjectPath(uri)
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
        if (!workspaceFolder) {
            throw Error('No workspace folder found')
        }

        const files = await collectFiles([projectPath], [workspaceFolder])
        for (const file of files) {
            const fileSize = (await fsCommon.stat(file.fileUri.fsPath)).size
            if (this.isJavaClassFile(file.fileUri)) {
                this._pickedBuildFiles.add(file.fileUri.fsPath)
                this._totalBuildSize += fileSize
            } else {
                if (
                    this.reachSizeLimit(this._totalSize, CodeWhispererConstants.SecurityScanType.Project) ||
                    this.willReachSizeLimit(this._totalSize, fileSize)
                ) {
                    throw new ToolkitError('Payload size limit reached.')
                }
                this._pickedSourceFiles.add(file.fileUri.fsPath)
                this._totalSize += fileSize
                this._totalLines += file.fileContent.split(ZipConstants.newlineRegex).length
            }
            zipStream.writeFile(file.fileUri.fsPath, path.join(projectName, file.relativeFilePath))
        }

        return zipStream.finalize()
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

    public async generateZip(uri: vscode.Uri, scanType: CodeWhispererConstants.SecurityScanType): Promise<ZipMetadata> {
        try {
            const zipDirPath = this.getZipDirPath()
            let zipStreamResult: ZipStreamResult
            if (scanType === CodeWhispererConstants.SecurityScanType.File) {
                zipStreamResult = await this.zipFile(uri)
            } else if (scanType === CodeWhispererConstants.SecurityScanType.Project) {
                zipStreamResult = await this.zipProject(uri)
            } else {
                throw new ToolkitError(`Unknown scan type: ${scanType}`)
            }

            getLogger().debug(`Picked source files: [${[...this._pickedSourceFiles].join(', ')}]`)
            return {
                rootDir: zipDirPath,
                zipMd5: zipStreamResult.md5,
                zipStreamBuffer: zipStreamResult.streamBuffer,
                srcPayloadSizeInBytes: this._totalSize,
                scannedFiles: new Set([...this._pickedSourceFiles, ...this._pickedBuildFiles]),
                zipFileSizeInBytes: zipStreamResult.sizeInBytes,
                buildPayloadSizeInBytes: this._totalBuildSize,
                lines: this._totalLines,
            }
        } catch (error) {
            getLogger().error('Zip error caused by:', error)
            throw error
        }
    }
}
