/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fsCommon } from '../../../srcShared/fs'
import * as vscode from 'vscode'
import admZip from 'adm-zip'
import { asyncCallWithTimeout } from '../commonUtil'
import * as path from 'path'
import { tempDirPath } from '../../../shared/filesystemUtilities'
import * as CodeWhispererConstants from '../../models/constants'
import { getLogger } from '../../../shared/logger'
export interface Truncation {
    rootDir: string
    zipFilePath: string
    scannedFiles: Set<string>
    srcPayloadSizeInBytes: number
    buildPayloadSizeInBytes: number
    zipFileSizeInBytes: number
    lines: number
}

export const DependencyGraphConstants = {
    /**
     * Key words
     */
    import: 'import',
    from: 'from',
    as: 'as',
    static: 'static',
    package: 'package',
    using: 'using',
    globalusing: 'global using',
    semicolon: ';',
    equals: '=',
    require: 'require',
    require_relative: 'require_relative',
    load: 'load',
    include: 'include',
    extend: 'extend',

    /**
     * Regex
     */
    newlineRegex: /\r?\n/,

    /**
     * File extension
     */
    pythonExt: '.py',
    javaExt: '.java',
    javaBuildExt: '.class',
    jsExt: '.js',
    tsExt: '.ts',
    csharpExt: '.cs',
    jsonExt: '.json',
    yamlExt: '.yaml',
    ymlExt: '.yml',
    tfExt: '.tf',
    hclExt: '.hcl',
    rubyExt: '.rb',
    goExt: '.go',
}

export abstract class DependencyGraph {
    protected _languageId: CodeWhispererConstants.PlatformLanguageId = 'plaintext'
    protected _sysPaths: Set<string> = new Set<string>()
    protected _parsedStatements: Set<string> = new Set<string>()
    protected _pickedSourceFiles: Set<string> = new Set<string>()
    protected _fetchedDirs: Set<string> = new Set<string>()
    protected _totalSize: number = 0
    protected _tmpDir: string = tempDirPath
    protected _truncDir: string = ''
    protected _totalLines: number = 0

    private _isProjectTruncated = false

    constructor(languageId: CodeWhispererConstants.PlatformLanguageId) {
        this._languageId = languageId
    }

    public getRootFile(editor: vscode.TextEditor) {
        return editor.document.uri
    }

    public getProjectName(uri: vscode.Uri) {
        const projectPath = this.getProjectPath(uri)
        return path.basename(projectPath)
    }

    public getProjectPath(uri: vscode.Uri) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
        if (workspaceFolder === undefined) {
            return path.dirname(uri.fsPath)
        }
        return workspaceFolder.uri.fsPath
    }

    protected getBaseDirPath(uri: vscode.Uri) {
        return path.dirname(uri.fsPath)
    }

    public getReadableSizeLimit(): string {
        const totalBytesInMB = Math.pow(2, 20)
        const totalBytesInKB = Math.pow(2, 10)
        if (this.getPayloadSizeLimitInBytes() >= totalBytesInMB) {
            return `${this.getPayloadSizeLimitInBytes() / totalBytesInMB}MB`
        } else {
            return `${this.getPayloadSizeLimitInBytes() / totalBytesInKB}KB`
        }
    }

    public willReachSizeLimit(current: number, adding: number): boolean {
        const willReachLimit = current + adding > this.getPayloadSizeLimitInBytes()
        this._isProjectTruncated = this._isProjectTruncated || willReachLimit
        return willReachLimit
    }

    public reachSizeLimit(size: number): boolean {
        return size > this.getPayloadSizeLimitInBytes()
    }

    public isProjectTruncated(): boolean {
        return this._isProjectTruncated
    }

    protected getDirPaths(uri: vscode.Uri): string[] {
        let dirPath = this.getBaseDirPath(uri)
        const paths: string[] = [dirPath]
        const projectPath = this.getProjectPath(uri)
        while (dirPath !== projectPath) {
            dirPath = path.join(dirPath, '..')
            paths.push(dirPath)
        }
        return paths
    }

    protected async copyFileToTmp(uri: vscode.Uri, destDir: string) {
        const projectName = this.getProjectName(uri)
        if (projectName) {
            const pos = uri.path.indexOf(projectName)
            const dest = path.join(destDir, uri.path.substring(pos))
            await fsCommon.copy(uri.fsPath, dest)
        }
    }

    protected zipDir(dir: string, extension: string): string {
        const zip = new admZip()
        zip.addLocalFolder(dir)
        zip.writeZip(dir + extension)
        return dir + extension
    }

    protected async removeZip(zipFilePath: string) {
        if (await fsCommon.exists(zipFilePath)) {
            await fsCommon.unlink(zipFilePath)
        }
    }

    protected getTruncDirPath(uri: vscode.Uri) {
        if (this._truncDir === '') {
            this._truncDir = path.join(
                this._tmpDir,
                CodeWhispererConstants.codeScanTruncDirPrefix + '_' + Date.now().toString()
            )
        }
        return this._truncDir
    }

    protected async getFilesTotalSize(files: string[]) {
        const statsPromises = files.map(file => fsCommon.stat(file))
        const stats = await Promise.all(statsPromises)
        return stats.reduce((accumulator, stat) => accumulator + stat.size, 0)
    }

    protected async copyFilesToTmpDir(files: Set<string> | string[], dir: string) {
        for (const filePath of files) {
            await this.copyFileToTmp(vscode.Uri.file(filePath), dir)
        }
    }

    public async removeTmpFiles(truncation: Truncation) {
        getLogger().verbose(`Cleaning up temporary files...`)
        await this.removeZip(truncation.zipFilePath)
        await fsCommon.delete(truncation.rootDir)
        getLogger().verbose(`Complete cleaning up temporary files.`)
    }

    public async generateTruncationWithTimeout(uri: vscode.Uri, seconds: number) {
        getLogger().verbose(`Scanning project for context truncation.`)
        return await asyncCallWithTimeout(this.generateTruncation(uri), 'Context truncation timeout.', seconds * 1000)
    }
    // 3 new functions added below for Cross-file and UTG support
    abstract getSourceDependencies(uri: vscode.Uri, content: string): Promise<string[]>

    abstract getSamePackageFiles(uri: vscode.Uri, projectPath: string): Promise<string[]>

    abstract isTestFile(content: string): Promise<boolean>

    abstract generateTruncation(uri: vscode.Uri): Promise<Truncation>

    abstract searchDependency(uri: vscode.Uri): Promise<Set<string>>

    abstract traverseDir(dirPath: string): void

    abstract parseImport(importStr: string, dirPaths: string[]): string[]

    abstract updateSysPaths(uri: vscode.Uri): void

    abstract getDependencies(uri: vscode.Uri, imports: string[]): void

    abstract getPayloadSizeLimitInBytes(): number
}
