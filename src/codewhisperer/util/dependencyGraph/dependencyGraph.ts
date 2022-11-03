/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as vscode from 'vscode'
import * as admZip from 'adm-zip'
import { existsSync, statSync } from 'fs'
import { asyncCallWithTimeout } from '../commonUtil'
import path = require('path')
import { tempDirPath } from '../../../shared/filesystemUtilities'
import * as CodeWhispererConstants from '../../models/constants'
import { getLogger } from '../../../shared/logger'

export interface Truncation {
    dir: string
    zip: string
    size: number
    zipSize: number
}

export interface TruncPaths {
    root: string
    src: Truncation
    build: Truncation
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
    semicolon: ';',

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
}

export abstract class DependencyGraph {
    protected _languageId: string = ''
    protected _sysPaths: Set<string> = new Set<string>()
    protected _parsedStatements: Set<string> = new Set<string>()
    protected _pickedSourceFiles: Set<string> = new Set<string>()
    protected _fetchedDirs: Set<string> = new Set<string>()
    protected _totalSize: number = 0
    protected _tmpDir: string = tempDirPath
    protected _truncDir: string = ''
    protected _totalLines: number = 0

    constructor(languageId: string) {
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

    protected getDirPaths(uri: vscode.Uri): string[] {
        let dirPath = this.getBaseDirPath(uri)
        const paths: string[] = [dirPath]
        const projectPath = this.getProjectPath(uri)
        while (dirPath != projectPath) {
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

    protected zipDir(dir: string, out: string, extension: string): string {
        const zip = new admZip()
        zip.addLocalFolder(dir)
        zip.writeZip(out + extension)
        return out + extension
    }

    protected removeDir(dir: string) {
        if (existsSync(dir)) fs.removeSync(dir)
    }

    protected removeZip(zipFilePath: string) {
        if (existsSync(zipFilePath)) fs.unlinkSync(zipFilePath)
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

    protected getTruncSourceDirPath(uri: vscode.Uri) {
        return path.join(this.getTruncDirPath(uri), 'src')
    }

    protected getTruncBuildDirPath(uri: vscode.Uri) {
        return path.join(this.getTruncDirPath(uri), 'build')
    }

    protected getFilesTotalSize(files: string[]) {
        return files.map(file => statSync(file)).reduce((accumulator, { size }) => accumulator + size, 0)
    }

    protected copyFilesToTmpDir(files: Set<string> | string[], dir: string) {
        files.forEach(filePath => {
            getLogger().debug(filePath)
            this.copyFileToTmp(vscode.Uri.file(filePath), dir)
        })
    }

    protected printTruncLogs(size: number, source: string, build: string | undefined = undefined) {
        const sourceZipSize = statSync(source).size
        getLogger().debug(`Complete ${this._languageId} dependency graph.`)
        getLogger().debug(`File count: ${this._pickedSourceFiles.size}`)
        getLogger().debug(`Total size: ${(size / 1024).toFixed(2)}kb`)
        getLogger().debug(`Total lines: ${this._totalLines}`)
        getLogger().debug(`Source zip file: ${source}`)
        getLogger().debug(`Source zip file size: ${(sourceZipSize / 1024).toFixed(2)}kb}`)
        if (build !== undefined) {
            const buildZipSize = statSync(build).size
            getLogger().debug(`Build zip file: ${build}`)
            getLogger().debug(`Build zip file size: ${(buildZipSize / 1024).toFixed(2)}kb}`)
        }
    }

    public removeTmpFiles(truncation: TruncPaths) {
        getLogger().verbose(`Cleaning up temporary files...`)
        this.removeZip(truncation.src.zip)
        this.removeZip(truncation.build.zip)
        this.removeDir(truncation.src.dir)
        this.removeDir(truncation.build.dir)
        this.removeDir(truncation.root)
        getLogger().verbose(`Complete cleaning up temporary files.`)
    }

    public async generateTruncationWithTimeout(uri: vscode.Uri, seconds: number) {
        getLogger().verbose(`Scanning project for context truncation.`)
        return await asyncCallWithTimeout(this.generateTruncation(uri), 'Context truncation timeout.', seconds * 1000)
    }

    abstract generateTruncation(uri: vscode.Uri): Promise<TruncPaths>

    abstract searchDependency(uri: vscode.Uri): Promise<Set<string>>

    abstract traverseDir(dirPath: string): void

    abstract parseImport(importStr: string, dirPaths: string[]): string[]

    abstract updateSysPaths(uri: vscode.Uri): void

    abstract getDependencies(uri: vscode.Uri, imports: string[]): void

    abstract reachSizeLimit(size: number): boolean

    abstract willReachSizeLimit(current: number, adding: number): boolean

    abstract getReadableSizeLimit(): string
}
