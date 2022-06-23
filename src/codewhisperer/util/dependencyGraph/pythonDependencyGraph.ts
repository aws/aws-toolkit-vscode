/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { existsSync, statSync, readdirSync } from 'fs'
import * as vscode from 'vscode'
import { DependencyGraph, TruncPaths } from './dependencyGraph'
import { getLogger } from '../../../shared/logger'
import { readFileAsString } from '../../../shared/filesystemUtilities'
import { CodeWhispererConstants } from '../../models/constants'
import path = require('path')
import { sleep } from '../../../shared/utilities/timeoutUtils'

export const IMPORT = 'import'
export const FROM = 'from'
export const AS = 'as'
export const FILE_EXT = '.py'
export const ENCODE = 'utf8'
export const IMPORT_REGEX =
    /^(?:from[ ]+(\S+)[ ]+)?import[ ]+(\S+)(?:[ ]+as[ ]+\S+)?[ ]*([,]*[ ]+(\S+)(?:[ ]+as[ ]+\S+)?[ ]*)*$/gm

export class PythonDependencyGraph extends DependencyGraph {
    getReadableSizeLimit(): string {
        return `${CodeWhispererConstants.codeScanPythonPayloadSizeLimitBytes / Math.pow(2, 10)}KB`
    }

    willReachSizeLimit(current: number, adding: number): boolean {
        return current + adding > CodeWhispererConstants.codeScanPythonPayloadSizeLimitBytes
    }

    reachSizeLimit(size: number): boolean {
        return size > CodeWhispererConstants.codeScanPythonPayloadSizeLimitBytes
    }

    private async readImports(uri: vscode.Uri) {
        const content: string = await readFileAsString(uri.fsPath)
        this._totalLines += content.split('\n').length
        const regExp = new RegExp(IMPORT_REGEX)
        return content.match(regExp) ?? []
    }

    private generateFilePath(rawModulePath: string, dirPath: string, importPath: string) {
        if (importPath === '') {
            const pos = rawModulePath.lastIndexOf('.')
            importPath = rawModulePath.substring(pos + 1)
            rawModulePath = rawModulePath.substring(0, pos)
        }
        const modulePath = path.join(...rawModulePath.split('.'))
        const filePath = path.join(dirPath, modulePath, importPath + FILE_EXT)
        return existsSync(filePath) ? filePath : ''
    }

    private generateFilePaths(modulePaths: string[], dirPaths: string[], importPaths: string[]) {
        const filePaths: string[] = []
        modulePaths.forEach(modulePath => {
            dirPaths.forEach(dirPath => {
                importPaths.forEach(importPath => {
                    const filePath = this.generateFilePath(modulePath, dirPath, importPath)
                    if (filePath !== '') {
                        filePaths.push(filePath)
                    }
                })
            })
        })
        return filePaths
    }

    private getImportPaths(importStr: string) {
        const importPaths: string[] = ['']
        if (importStr.startsWith(FROM)) {
            let pos = importStr.indexOf(IMPORT)
            const extractImportStr = importStr.substring(pos + IMPORT.length).trim()
            const allImports: string[] = extractImportStr.split(',')
            allImports.forEach(singleImport => {
                pos = singleImport.indexOf(' ' + AS + ' ')
                if (pos !== -1) {
                    const importPath = singleImport.substring(0, pos)
                    importPaths.push(importPath.trim())
                } else {
                    importPaths.push(singleImport.trim())
                }
            })
        }
        return importPaths
    }

    private getModulePath(modulePathStr: string) {
        const pos = modulePathStr.indexOf(' ' + AS + ' ')
        if (pos !== -1) modulePathStr = modulePathStr.substring(0, pos)
        return modulePathStr.trim()
    }

    private extractModulePaths(importStr: string) {
        const modulePaths: string[] = []
        if (importStr.startsWith(FROM)) {
            const pos = importStr.indexOf(IMPORT)
            const modulePathStr = importStr.substring(FROM.length, pos).trim()
            modulePaths.push(this.getModulePath(modulePathStr))
        } else {
            const pos = importStr.indexOf(IMPORT)
            const extractImportStr = importStr.substring(pos + IMPORT.length).trim()
            const modulePathStrs: string[] = extractImportStr.split(',')
            modulePathStrs.forEach(modulePathStr => {
                modulePaths.push(this.getModulePath(modulePathStr))
            })
        }
        return modulePaths
    }

    parseImport(importStr: string, dirPaths: string[]) {
        if (this._parsedStatements.has(importStr)) return []
        this._parsedStatements.add(importStr)
        const modulePaths = this.extractModulePaths(importStr)
        const importPaths = this.getImportPaths(importStr)
        const dependencies = this.generateFilePaths(modulePaths, dirPaths, importPaths)
        return dependencies
    }

    updateSysPaths(uri: vscode.Uri) {
        this.getDirPaths(uri).forEach(dirPath => {
            this._sysPaths.add(dirPath)
        })
    }

    getDependencies(uri: vscode.Uri, imports: string[]) {
        const dependencies: string[] = []
        imports.forEach(importStr => {
            this.updateSysPaths(uri)
            const findings = this.parseImport(importStr, Array.from(this._sysPaths.values()))
            const validSourceFiles = findings.filter(finding => !this._pickedSourceFiles.has(finding))
            validSourceFiles.forEach(file => {
                if (existsSync(file) && !this.willReachSizeLimit(this._totalSize, statSync(file).size)) {
                    dependencies.push(file)
                }
            })
        })
        return dependencies
    }

    async searchDependency(uri: vscode.Uri) {
        const filePath = uri.fsPath
        const q: string[] = []
        q.push(filePath)
        while (q.length > 0) {
            let count: number = q.length
            while (count > 0) {
                if (this.reachSizeLimit(this._totalSize)) return
                count -= 1
                const currentFilePath = q.shift()
                if (currentFilePath === undefined) throw new Error('"undefined" is invalid for queued file.')
                this._pickedSourceFiles.add(currentFilePath)
                this._totalSize += statSync(currentFilePath).size
                const uri = vscode.Uri.file(currentFilePath)
                const imports = await this.readImports(uri)
                const dependencies = this.getDependencies(uri, imports)
                dependencies.forEach(dependency => {
                    q.push(dependency)
                })
            }
        }
    }

    async traverseDir(dirPath: string) {
        if (this.reachSizeLimit(this._totalSize)) return
        readdirSync(dirPath, { encoding: ENCODE, withFileTypes: true }).forEach(async file => {
            const absPath = path.join(dirPath, file.name)
            if (!existsSync(absPath)) return
            if (file.isDirectory()) {
                await this.traverseDir(absPath)
            } else if (file.isFile()) {
                if (
                    file.name.endsWith(FILE_EXT) &&
                    !this.reachSizeLimit(this._totalSize) &&
                    !this.willReachSizeLimit(this._totalSize, statSync(absPath).size) &&
                    !this._pickedSourceFiles.has(absPath)
                ) {
                    await this.searchDependency(vscode.Uri.file(absPath))
                }
            }
        })
    }

    async generateTruncation(uri: vscode.Uri): Promise<TruncPaths> {
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
            if (workspaceFolder === undefined) {
                this._pickedSourceFiles.add(uri.fsPath)
            } else {
                await this.searchDependency(uri)
                await this.traverseDir(this.getProjectPath(uri))
            }
            await sleep(1000)
            const truncDirPath = this.getTruncDirPath(uri)
            this._pickedSourceFiles.forEach(sourceFilePath => {
                getLogger().debug(sourceFilePath)
                this.copyFileToTmp(vscode.Uri.file(sourceFilePath), truncDirPath)
            })
            const zipFilePath = this.zipDir(truncDirPath, truncDirPath, CodeWhispererConstants.codeScanZipExt)
            getLogger().debug(`Complete Python dependency graph.`)
            getLogger().debug(`File count: ${this._pickedSourceFiles.size}`)
            getLogger().debug(`Total size: ${(this._totalSize / 1024).toFixed(2)}kb`)
            getLogger().debug(`Total lines: ${this._totalLines}`)
            getLogger().debug(`Zip file: ${zipFilePath}`)
            return {
                root: truncDirPath,
                src: {
                    dir: truncDirPath,
                    zip: zipFilePath,
                    size: this._totalSize,
                },
                build: {
                    dir: '',
                    zip: '',
                    size: 0,
                },
                lines: this._totalLines,
            }
        } catch (error) {
            getLogger().error('Python dependency graph error caused by:', error)
            throw new Error('Python context processing failed.')
        }
    }
}
