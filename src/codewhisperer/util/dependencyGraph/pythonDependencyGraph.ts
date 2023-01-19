/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { existsSync, statSync, readdirSync } from 'fs'
import * as vscode from 'vscode'
import { DependencyGraphConstants, DependencyGraph, TruncPaths } from './dependencyGraph'
import { getLogger } from '../../../shared/logger'
import { readFileAsString } from '../../../shared/filesystemUtilities'
import * as CodeWhispererConstants from '../../models/constants'
import path = require('path')
import { sleep } from '../../../shared/utilities/timeoutUtils'

export const importRegex =
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
        this._totalLines += content.split(DependencyGraphConstants.newlineRegex).length
        const regExp = new RegExp(importRegex)
        return content.match(regExp) ?? []
    }

    private generateFilePath(rawModulePath: string, dirPath: string, importPath: string) {
        if (importPath === '') {
            const pos = rawModulePath.lastIndexOf('.')
            importPath = rawModulePath.substring(pos + 1)
            rawModulePath = rawModulePath.substring(0, pos)
        }
        const modulePath = path.join(...rawModulePath.split('.'))
        const filePath = path.join(dirPath, modulePath, importPath + DependencyGraphConstants.pythonExt)
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
        if (importStr.startsWith(DependencyGraphConstants.from)) {
            let pos = importStr.indexOf(DependencyGraphConstants.import)
            const extractImportStr = importStr.substring(pos + DependencyGraphConstants.import.length).trim()
            const allImports: string[] = extractImportStr.split(',')
            allImports.forEach(singleImport => {
                pos = singleImport.indexOf(' ' + DependencyGraphConstants.as + ' ')
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
        const pos = modulePathStr.indexOf(' ' + DependencyGraphConstants.as + ' ')
        if (pos !== -1) {
            modulePathStr = modulePathStr.substring(0, pos)
        }
        return modulePathStr.trim()
    }

    private extractModulePaths(importStr: string) {
        const modulePaths: string[] = []
        if (importStr.startsWith(DependencyGraphConstants.from)) {
            const pos = importStr.indexOf(DependencyGraphConstants.import)
            const modulePathStr = importStr.substring(DependencyGraphConstants.from.length, pos).trim()
            modulePaths.push(this.getModulePath(modulePathStr))
        } else {
            const pos = importStr.indexOf(DependencyGraphConstants.import)
            const extractImportStr = importStr.substring(pos + DependencyGraphConstants.import.length).trim()
            const modulePathStrs: string[] = extractImportStr.split(',')
            modulePathStrs.forEach(modulePathStr => {
                modulePaths.push(this.getModulePath(modulePathStr))
            })
        }
        return modulePaths
    }

    parseImport(importStr: string, dirPaths: string[]) {
        if (this._parsedStatements.has(importStr)) {
            return []
        }
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

    async searchDependency(uri: vscode.Uri): Promise<Set<string>> {
        const filePath = uri.fsPath
        const q: string[] = []
        q.push(filePath)
        while (q.length > 0) {
            let count: number = q.length
            while (count > 0) {
                if (this.reachSizeLimit(this._totalSize)) {
                    return this._pickedSourceFiles
                }
                count -= 1
                const currentFilePath = q.shift()
                if (currentFilePath === undefined) {
                    throw new Error('"undefined" is invalid for queued file.')
                }
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
        return this._pickedSourceFiles
    }

    async traverseDir(dirPath: string) {
        if (this.reachSizeLimit(this._totalSize)) {
            return
        }
        readdirSync(dirPath, { withFileTypes: true }).forEach(async file => {
            const absPath = path.join(dirPath, file.name)
            if (file.name.charAt(0) === '.' || !existsSync(absPath)) {
                return
            }
            if (file.isDirectory()) {
                await this.traverseDir(absPath)
            } else if (file.isFile()) {
                if (
                    file.name.endsWith(DependencyGraphConstants.pythonExt) &&
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
            this.copyFilesToTmpDir(this._pickedSourceFiles, truncDirPath)
            const zipFilePath = this.zipDir(truncDirPath, truncDirPath, CodeWhispererConstants.codeScanZipExt)
            const zipFileSize = statSync(zipFilePath).size
            return {
                root: truncDirPath,
                src: {
                    dir: truncDirPath,
                    zip: zipFilePath,
                    size: this._totalSize,
                    zipSize: zipFileSize,
                },
                build: {
                    dir: '',
                    zip: '',
                    size: 0,
                    zipSize: 0,
                },
                lines: this._totalLines,
            }
        } catch (error) {
            getLogger().error(`${this._languageId} dependency graph error caused by:`, error)
            throw new Error(`${this._languageId} context processing failed.`)
        }
    }
}
