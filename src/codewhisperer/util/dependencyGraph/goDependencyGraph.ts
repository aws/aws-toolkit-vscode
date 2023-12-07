/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Uri } from 'vscode'
import { DependencyGraph, DependencyGraphConstants, Truncation } from './dependencyGraph'
import * as CodeWhispererConstants from '../../models/constants'
import { existsSync, readdirSync, statSync } from 'fs'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { getLogger } from '../../../shared/logger'
import path from 'path'
import { readFileAsString } from '../../../shared/filesystemUtilities'
import { ToolkitError } from '../../../shared/errors'

const importRegex = /^\s*import\s+([^(]+?$|\([^)]+\))/gm
const moduleRegex = /"[^"\r\n]+"/gm
const packageRegex = /^package\s+(.+)/gm

export class GoDependencyGraph extends DependencyGraph {
    override async getSourceDependencies(uri: Uri, content: string): Promise<string[]> {
        const imports = this.readImports(content)
        const dependencies = this.getDependencies(uri, imports)
        return dependencies
    }

    // Returns file paths of other .go files in the same directory declared with the same package statement.
    override async getSamePackageFiles(uri: Uri): Promise<string[]> {
        const fileList: string[] = []
        const packagePath = path.dirname(uri.fsPath)
        const fileName = path.basename(uri.fsPath)
        const content = await readFileAsString(uri.fsPath)
        const packageName = this.readPackageName(content)

        const files = readdirSync(packagePath, { withFileTypes: true })
        for (const file of files) {
            if (file.isDirectory() || !file.name.endsWith(DependencyGraphConstants.goExt) || file.name === fileName) {
                continue
            }
            const filePath = path.join(packagePath, file.name)
            const content = await readFileAsString(filePath)
            if (this.readPackageName(content) !== packageName) {
                continue
            }
            fileList.push(filePath)
        }

        return fileList
    }

    override async isTestFile(content: string): Promise<boolean> {
        const imports = this.readImports(content)
        const filteredImports = imports.filter(importStr => {
            return importStr.includes('"testing"')
        })
        return filteredImports.length > 0
    }

    override async generateTruncation(uri: Uri): Promise<Truncation> {
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
            if (workspaceFolder === undefined) {
                this._pickedSourceFiles.add(uri.fsPath)
            } else {
                await this.searchDependency(uri)
                await this.traverseDir(this.getProjectPath(uri))
            }
            await sleep(1000)
            getLogger().verbose(`CodeWhisperer: Picked source files: [${[...this._pickedSourceFiles].join(', ')}]`)
            const truncDirPath = this.getTruncDirPath(uri)
            this.copyFilesToTmpDir(this._pickedSourceFiles, truncDirPath)
            const zipFilePath = this.zipDir(truncDirPath, CodeWhispererConstants.codeScanZipExt)
            const zipFileSize = statSync(zipFilePath).size
            return {
                rootDir: truncDirPath,
                zipFilePath,
                scannedFiles: new Set(this._pickedSourceFiles),
                srcPayloadSizeInBytes: this._totalSize,
                zipFileSizeInBytes: zipFileSize,
                buildPayloadSizeInBytes: 0,
                lines: this._totalLines,
            }
        } catch (error) {
            getLogger().error('Go dependency graph error caused by:', error)
            throw ToolkitError.chain(error, 'Go context processing failed.')
        }
    }

    override async searchDependency(uri: Uri): Promise<Set<string>> {
        const filePath = uri.fsPath
        const q: string[] = []
        q.push(filePath)
        const siblings = await this.getSamePackageFiles(uri)
        siblings.forEach(sibling => {
            q.push(sibling)
        })
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
                if (this._pickedSourceFiles.has(currentFilePath)) {
                    continue
                }
                this._pickedSourceFiles.add(currentFilePath)
                this._totalSize += statSync(currentFilePath).size
                const uri = vscode.Uri.file(currentFilePath)
                const content: string = await readFileAsString(uri.fsPath)
                const dependencies = await this.getSourceDependencies(uri, content)
                dependencies.forEach(dependency => {
                    q.push(dependency)
                })
            }
        }

        return this._pickedSourceFiles
    }

    override async traverseDir(dirPath: string): Promise<void> {
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
                    file.name.endsWith(DependencyGraphConstants.goExt) &&
                    !this.reachSizeLimit(this._totalSize) &&
                    !this.willReachSizeLimit(this._totalSize, statSync(absPath).size)
                ) {
                    await this.searchDependency(vscode.Uri.file(absPath))
                }
            }
        })
    }

    override parseImport(importStr: string, dirPaths: string[]): string[] {
        if (this._parsedStatements.has(importStr)) {
            return []
        }

        this._parsedStatements.add(importStr)
        const modulePaths = this.extractModulePaths(importStr)
        const dependencies = this.generateSourceFilePaths(modulePaths, dirPaths)
        return dependencies
    }

    override updateSysPaths(uri: Uri): void {
        this.getDirPaths(uri).forEach(dirPath => {
            this._sysPaths.add(dirPath)
        })
    }

    override getDependencies(uri: Uri, imports: string[]): string[] {
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

    override getPayloadSizeLimitInBytes(): number {
        return CodeWhispererConstants.codeScanGoPayloadSizeLimitBytes
    }

    private generateSourceFilePaths(modulePaths: string[], dirPaths: string[]): string[] {
        const filePaths: string[] = []
        modulePaths.forEach(modulePath => {
            dirPaths.forEach(dirPath => {
                const packageDir = this.generateSourceFilePath(modulePath, dirPath)
                if (packageDir !== '') {
                    readdirSync(packageDir, { withFileTypes: true }).forEach(file => {
                        if (file.name.endsWith(DependencyGraphConstants.goExt)) {
                            filePaths.push(path.join(packageDir, file.name))
                        }
                    })
                }
            })
        })
        return filePaths
    }

    private generateSourceFilePath(modulePath: string, dirPath: string): string {
        if (modulePath.length === 0) {
            return ''
        }
        const packageDir = path.join(dirPath, modulePath)
        const slashPos = modulePath.indexOf('/')
        const newModulePath = slashPos !== -1 ? modulePath.substring(slashPos + 1) : ''

        return existsSync(packageDir) ? packageDir : this.generateSourceFilePath(newModulePath, dirPath)
    }

    private extractModulePaths(importStr: string): string[] {
        const matches = importStr.match(moduleRegex)
        if (matches) {
            return matches.map(match => match.substring(1, match.length - 1))
        }
        return []
    }

    private readImports(content: string) {
        this._totalLines += content.split(DependencyGraphConstants.newlineRegex).length
        const regExp = new RegExp(importRegex)
        return content.match(regExp) ?? []
    }

    private readPackageName(content: string) {
        const regExp = new RegExp(packageRegex)
        const matches = regExp.exec(content)
        if (matches && matches.length > 1) {
            return matches[1]
        }
        return ''
    }
}

export class GoDependencyGraphError extends Error {}
