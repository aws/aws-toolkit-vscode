/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { existsSync, statSync, readdirSync } from 'fs'
import * as vscode from 'vscode'
import { DependencyGraphConstants, DependencyGraph, Truncation } from './dependencyGraph'
import { getLogger } from '../../../shared/logger'
import { readFileAsString } from '../../../shared/filesystemUtilities'
import * as CodeWhispererConstants from '../../models/constants'
import path = require('path')
import { sleep } from '../../../shared/utilities/timeoutUtils'

export const importRegex = /^[ \t]*import[ \t]+.+;?$/gm
export const requireRegex = /^[ \t]*.+require[ \t]*\([ \t]*['"][^'"]+['"][ \t]*\)[ \t]*;?/gm
export const moduleRegex = /["'][^"'\r\n]+["']/gm

export class JavascriptDependencyGraph extends DependencyGraph {
    private _generatedDirs: Set<string> = new Set(['node_modules', 'dist', 'build', 'cdk.out'])

    getPayloadSizeLimitInBytes(): number {
        return CodeWhispererConstants.codeScanJavascriptPayloadSizeLimitBytes
    }

    getModulePath(modulePathStr: string) {
        const matches = modulePathStr.match(moduleRegex)
        if (matches) {
            const extract = matches[0]
            modulePathStr = extract.substring(1, extract.length - 1)
            return modulePathStr.trim()
        }
        return undefined
    }

    extractModulePaths(importStr: string) {
        const modulePaths: string[] = []
        const pos = importStr.indexOf(' ' + DependencyGraphConstants.from + ' ')
        const modulePathStr =
            pos === -1
                ? importStr.substring(DependencyGraphConstants.import.length).trim()
                : importStr.substring(pos + DependencyGraphConstants.from.length + 1).trim()
        const modulePath = this.getModulePath(modulePathStr)
        if (modulePath) {
            modulePaths.push(modulePath)
        }
        return modulePaths
    }

    generateFilePath(modulePath: string, dirPath: string) {
        const filePath = modulePath.startsWith('.')
            ? path.join(dirPath, modulePath + DependencyGraphConstants.jsExt)
            : modulePath + DependencyGraphConstants.jsExt
        return filePath.includes(dirPath) && existsSync(filePath) ? filePath : ''
    }

    generateFilePaths(modulePaths: string[], dirPaths: string[]) {
        const filePaths: string[] = []
        modulePaths.forEach(modulePath => {
            dirPaths.forEach(dirPath => {
                const filePath = this.generateFilePath(modulePath, dirPath)
                if (filePath !== '') {
                    filePaths.push(filePath)
                }
            })
        })
        return filePaths
    }

    parseImport(importStr: string, dirPaths: string[]): string[] {
        if (this._parsedStatements.has(importStr)) {
            return []
        }
        this._parsedStatements.add(importStr)
        const modulePaths = this.extractModulePaths(importStr)
        const dependencies = this.generateFilePaths(modulePaths, dirPaths)
        return dependencies
    }

    updateSysPaths(uri: vscode.Uri) {
        throw new Error('Method not implemented.')
    }

    getDependencies(uri: vscode.Uri, imports: string[]) {
        const dependencies: string[] = []
        imports.forEach(importStr => {
            const findings = this.parseImport(importStr, [this.getBaseDirPath(uri)])
            const validSourceFiles = findings.filter(finding => !this._pickedSourceFiles.has(finding))
            validSourceFiles.forEach(file => {
                if (existsSync(file) && !this.willReachSizeLimit(this._totalSize, statSync(file).size)) {
                    dependencies.push(file)
                }
            })
        })
        return dependencies
    }

    async readImports(uri: vscode.Uri) {
        const content: string = await readFileAsString(uri.fsPath)
        this._totalLines += content.split(DependencyGraphConstants.newlineRegex).length
        const importRegExp = new RegExp(importRegex)
        const requireRegExp = new RegExp(requireRegex)
        const importMatches = content.match(importRegExp)
        const requireMatches = content.match(requireRegExp)
        const matches: Set<string> = new Set()
        if (importMatches) {
            importMatches.forEach(line => {
                if (!matches.has(line)) {
                    matches.add(line)
                }
            })
        }
        if (requireMatches) {
            requireMatches.forEach(line => {
                if (!matches.has(line)) {
                    matches.add(line)
                }
            })
        }
        return matches.size > 0 ? Array.from(matches) : []
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
                    throw new Error('Invalid file in queue.')
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
            if (file.isDirectory() && !this._generatedDirs.has(file.name)) {
                await this.traverseDir(absPath)
            } else if (file.isFile()) {
                //Check for .ts and .js file extensions & zip separately for security scans
                if (
                    file.name.endsWith(
                        this._languageId === 'typescript'
                            ? DependencyGraphConstants.tsExt
                            : DependencyGraphConstants.jsExt
                    ) &&
                    !this.reachSizeLimit(this._totalSize) &&
                    !this.willReachSizeLimit(this._totalSize, statSync(absPath).size) &&
                    !this._pickedSourceFiles.has(absPath)
                ) {
                    await this.searchDependency(vscode.Uri.file(absPath))
                }
            }
        })
    }

    async generateTruncation(uri: vscode.Uri): Promise<Truncation> {
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
            await this.copyFilesToTmpDir(this._pickedSourceFiles, truncDirPath)
            const zipFilePath = this.zipDir(truncDirPath, CodeWhispererConstants.codeScanZipExt)
            const zipFileSize = statSync(zipFilePath).size
            return {
                rootDir: truncDirPath,
                zipFilePath: zipFilePath,
                scannedFiles: new Set(this._pickedSourceFiles),
                srcPayloadSizeInBytes: this._totalSize,
                zipFileSizeInBytes: zipFileSize,
                buildPayloadSizeInBytes: 0,
                lines: this._totalLines,
            }
        } catch (error) {
            getLogger().error(`${this._languageId} dependency graph error caused by:`, error)
            throw new Error(`${this._languageId} context processing failed.`)
        }
    }

    async isTestFile(content: string) {
        // TODO: Implement this
        return false
    }

    async getSourceDependencies(uri: vscode.Uri, content: string) {
        // TODO: Implement this
        return []
    }

    async getSamePackageFiles(uri: vscode.Uri, projectPath: string): Promise<string[]> {
        // TODO: Implement this
        return []
    }
}
