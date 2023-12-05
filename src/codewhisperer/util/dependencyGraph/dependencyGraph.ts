/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as vscode from 'vscode'
import admZip from 'adm-zip'
import { existsSync, statSync } from 'fs'
import { asyncCallWithTimeout } from '../commonUtil'
import path = require('path')
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

    protected copyFileToTmp(uri: vscode.Uri, destDir: string) {
        const projectName = this.getProjectName(uri)
        if (projectName) {
            const pos = uri.path.indexOf(projectName)
            const dest = path.join(destDir, uri.path.substring(pos))
            fs.copySync(uri.fsPath, dest)
        }
    }

    protected zipDir(dir: string, extension: string): string {
        const zip = new admZip()
        zip.addLocalFolder(dir)
        zip.writeZip(dir + extension)
        return dir + extension
    }

    protected removeDir(dir: string) {
        if (existsSync(dir)) {
            fs.removeSync(dir)
        }
    }

    protected removeZip(zipFilePath: string) {
        if (existsSync(zipFilePath)) {
            fs.unlinkSync(zipFilePath)
        }
    }

    protected getTruncDirPath(uri: vscode.Uri) {
        if (this._truncDir === '') {
            this._truncDir = path.join(
                this._tmpDir,
                CodeWhispererConstants.codeScanTruncDirPrefix + '_' + new Date().getTime().toString()
            )
        }
        return this._truncDir
    }

    protected getFilesTotalSize(files: string[]) {
        return files.map(file => statSync(file)).reduce((accumulator, { size }) => accumulator + size, 0)
    }

    protected copyFilesToTmpDir(files: Set<string> | string[], dir: string) {
        files.forEach(filePath => {
            this.copyFileToTmp(vscode.Uri.file(filePath), dir)
        })
    }

    public removeTmpFiles(truncation: Truncation) {
        getLogger().verbose(`Cleaning up temporary files...`)
        this.removeZip(truncation.zipFilePath)
        this.removeDir(truncation.rootDir)
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
