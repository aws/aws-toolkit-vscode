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
import { fsCommon } from '../../srcShared/fs'
import { statSync } from 'fs'

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
}

export class ZipUtil {
    protected _pickedSourceFiles: Set<string> = new Set<string>()
    protected _totalSize: number = 0
    protected _tmpDir: string = tempDirPath
    protected _zipDir: string = ''
    protected _totalLines: number = 0

    constructor() {}

    getFileScanPayloadSizeLimitInBytes(): number {
        return CodeWhispererConstants.fileScanPayloadSizeLimitBytes
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

    public reachSizeLimit(size: number): boolean {
        return size > this.getFileScanPayloadSizeLimitInBytes()
    }

    protected async zipFile(uri: vscode.Uri) {
        const zip = new admZip()

        const projectName = this.getProjectName(uri)
        const relativePath = vscode.workspace.asRelativePath(uri)

        const content = await this.getTextContent(uri)

        zip.addFile(path.join(projectName, relativePath), Buffer.from(content, 'utf-8'))

        this._pickedSourceFiles.add(relativePath)
        this._totalSize += statSync(uri.fsPath).size
        this._totalLines += content.split(ZipConstants.newlineRegex).length

        if (this.reachSizeLimit(this._totalSize)) {
            getLogger().error(`Payload size limit reached.`)
            throw new Error('Payload size limit reached.')
        }

        const zipFilePath = this.getZipDirPath() + CodeWhispererConstants.codeScanZipExt
        zip.writeZip(zipFilePath)
        return zipFilePath
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

    public async generateZip(uri: vscode.Uri): Promise<ZipMetadata> {
        try {
            const zipDirPath = this.getZipDirPath()
            const zipFilePath = await this.zipFile(uri)
            getLogger().debug(`Picked source files: [${[...this._pickedSourceFiles].join(', ')}]`)
            const zipFileSize = statSync(zipFilePath).size
            return {
                rootDir: zipDirPath,
                zipFilePath: zipFilePath,
                srcPayloadSizeInBytes: this._totalSize,
                scannedFiles: new Set(this._pickedSourceFiles),
                zipFileSizeInBytes: zipFileSize,
                buildPayloadSizeInBytes: 0,
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
