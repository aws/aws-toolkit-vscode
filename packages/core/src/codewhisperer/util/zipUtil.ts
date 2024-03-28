/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import admZip from 'adm-zip'
import * as vscode from 'vscode'
import path from 'path'
import { readFileAsString, tempDirPath } from '../../shared/filesystemUtilities'
import { getLogger } from '../../shared/logger'
import * as CodeWhispererConstants from '../models/constants'
import { existsSync, readdirSync, statSync } from 'fs'
import { ToolkitError } from '../../shared/errors'
import ignore, { Ignore } from 'ignore'
import { fsCommon } from '../../srcShared/fs'

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

    protected async traverseDir(dirPath: string, ignore?: Ignore) {
        if (!existsSync(dirPath) || this._fetchedDirs.has(dirPath)) {
            return
        }
        if (this.reachSizeLimit(this._totalSize, CodeWhispererConstants.SecurityScanType.Project)) {
            getLogger().error(`Payload size limit reached.`)
            throw new ToolkitError('Payload size limit reached.')
        }

        const files = readdirSync(dirPath, { withFileTypes: true })
        for (const file of files) {
            const fileAbsPath = path.join(dirPath, file.name)
            if (file.name.charAt(0) === '.' || !existsSync(fileAbsPath)) {
                continue
            }
            if (file.isDirectory()) {
                await this.traverseDir(fileAbsPath, ignore)
            } else if (file.isFile()) {
                const projectPath = this.getProjectPath(vscode.Uri.file(fileAbsPath))
                const fileRelativePath = path.relative(projectPath, fileAbsPath)
                const currentFileSize = statSync(fileAbsPath).size
                if (this.isJavaClassFile(vscode.Uri.file(fileAbsPath))) {
                    this._pickedBuildFiles.add(fileAbsPath)
                    this._totalBuildSize += currentFileSize
                } else if (!ignore?.ignores(fileRelativePath) && !this._pickedSourceFiles.has(fileAbsPath)) {
                    if (this.willReachSizeLimit(this._totalSize, currentFileSize)) {
                        getLogger().error(`Payload size limit reached.`)
                        throw new ToolkitError('Payload size limit reached.')
                    }
                    this._pickedSourceFiles.add(fileAbsPath)
                    this._totalSize += currentFileSize
                    const content = await readFileAsString(fileAbsPath)
                    this._totalLines += content.split(ZipConstants.newlineRegex).length
                }
            }
        }

        this._fetchedDirs.add(dirPath)
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

        if (this.reachSizeLimit(this._totalSize, CodeWhispererConstants.SecurityScanType.File)) {
            getLogger().error(`Payload size limit reached.`)
            throw new ToolkitError('Payload size limit reached.')
        }

        const zipFilePath = this.getZipDirPath() + CodeWhispererConstants.codeScanZipExt
        zip.writeZip(zipFilePath)
        return zipFilePath
    }

    protected async zipProject(uri: vscode.Uri) {
        const zip = new admZip()

        const projectName = this.getProjectName(uri)
        const projectPath = this.getProjectPath(uri)
        const gitignorePath = path.join(projectPath, ZipConstants.gitignoreFilename)
        const gitignoreExists = existsSync(gitignorePath)

        if (!gitignoreExists) {
            getLogger().verbose('Project does not contain .gitignore, scanning all files')
            await this.traverseDir(projectPath)
        } else {
            getLogger().verbose(`Reading .gitignore at ${gitignorePath}`)
            const gitignoreAsString = await readFileAsString(gitignorePath)
            const gitignore = ignore().add(gitignoreAsString)
            await this.traverseDir(projectPath, gitignore)
        }

        zip.addLocalFolder(projectPath, projectName, fileName => {
            const fileAbsPath = path.join(projectPath, fileName)
            return this._pickedSourceFiles.has(fileAbsPath) || this._pickedBuildFiles.has(fileAbsPath)
        })

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

    public async generateZip(uri: vscode.Uri, scanType: CodeWhispererConstants.SecurityScanType): Promise<ZipMetadata> {
        try {
            const zipDirPath = this.getZipDirPath()
            let zipFilePath: string
            if (scanType === CodeWhispererConstants.SecurityScanType.File) {
                zipFilePath = await this.zipFile(uri)
            } else if (scanType === CodeWhispererConstants.SecurityScanType.Project) {
                zipFilePath = await this.zipProject(uri)
            } else {
                throw new ToolkitError(`Unknown scan type: ${scanType}`)
            }

            getLogger().debug(`Picked source files: [${[...this._pickedSourceFiles].join(', ')}]`)
            const zipFileSize = statSync(zipFilePath).size
            return {
                rootDir: zipDirPath,
                zipFilePath: zipFilePath,
                srcPayloadSizeInBytes: this._totalSize,
                scannedFiles: new Set(this._pickedSourceFiles),
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
