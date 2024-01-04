/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { existsSync, statSync, readdirSync } from 'fs'
import * as vscode from 'vscode'
import { DependencyGraphConstants, DependencyGraph, Truncation } from './dependencyGraph'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { readFileAsString } from '../../../shared/filesystemUtilities'
import { getLogger } from '../../../shared/logger'
import * as CodeWhispererConstants from '../../models/constants'
import path = require('path')

export const importRegex =
    /(global\s)?using\s(static\s)?((\b[A-Z][A-Za-z]+(\.\b[A-Z][A-Za-z]+)*)|\w+\s*=\s*([\w.]+));/gm

export class CsharpDependencyGraph extends DependencyGraph {
    // Payload Size for C#: 1MB
    getPayloadSizeLimitInBytes(): number {
        return CodeWhispererConstants.codeScanCsharpPayloadSizeLimitBytes
    }

    // No ImportPaths in C# so returning filePath = dirPath + moduluePath + csharpExtension
    private generateFilePath(modulePath: string, dirPath: string) {
        const filePath = path.join(dirPath, modulePath + DependencyGraphConstants.csharpExt)
        return existsSync(filePath) ? filePath : ''
    }

    //For Generating File Paths
    private generateFilePaths(modulePaths: string[], dirPaths: string[]) {
        return modulePaths
            .flatMap(modulePath => dirPaths.map(dirPath => this.generateFilePath(modulePath, dirPath)))
            .filter(filePath => filePath !== '')
    }

    //Generate the combinations for module paths
    private generateModulePaths(inputPath: string): string[] {
        const inputPaths = inputPath.split('.')
        let outputPath = ''
        return inputPaths.map(pathSegment => {
            outputPath += (outputPath ? '.' : '') + pathSegment
            return path.join(...outputPath.split('.'))
        })
    }

    private getModulePath(modulePathStr: string) {
        const index = modulePathStr.indexOf(DependencyGraphConstants.equals)
        const modulePath = index !== -1 ? modulePathStr.substring(index + 1) : modulePathStr
        return this.generateModulePaths(modulePath.trim())
    }

    private extractModulePaths(importStr: string) {
        let modulePaths: string[] = []
        const usingKeyword = DependencyGraphConstants.using
        const globalUsingKeyword = DependencyGraphConstants.globalusing
        const staticKeyword = DependencyGraphConstants.static
        // Check if Import statement starts with either "using" or "global using"
        if (importStr.startsWith(usingKeyword) || importStr.startsWith(globalUsingKeyword)) {
            const indexOfStatic = importStr.indexOf(staticKeyword)
            const modulePathStr =
                indexOfStatic !== -1
                    ? importStr.substring(indexOfStatic + staticKeyword.length).trim()
                    : importStr.substring(importStr.indexOf(usingKeyword) + usingKeyword.length).trim()

            modulePaths = this.getModulePath(modulePathStr.replace(' ', ''))
        }

        return modulePaths
    }

    override parseImport(importStr: string, dirPaths: string[]) {
        //return dependencies from the import statement
        if (this._parsedStatements.has(importStr)) {
            return []
        }

        this._parsedStatements.add(importStr)
        const modulePaths = this.extractModulePaths(importStr)
        const dependencies = this.generateFilePaths(modulePaths, dirPaths)
        return dependencies
    }

    override updateSysPaths(uri: vscode.Uri) {
        this.getDirPaths(uri).forEach(dirPath => {
            this._sysPaths.add(dirPath)
        })
    }
    override getDependencies(uri: vscode.Uri, imports: string[]) {
        const dependencies: string[] = []
        imports.forEach(importStr => {
            this.updateSysPaths(uri)
            const importString = importStr.replace(';', '')
            const findings = this.parseImport(importString, Array.from(this._sysPaths.values()))
            const validSourceFiles = findings.filter(finding => !this._pickedSourceFiles.has(finding))
            validSourceFiles.forEach(file => {
                if (existsSync(file) && !this.willReachSizeLimit(this._totalSize, statSync(file).size)) {
                    dependencies.push(file)
                }
            })
        })
        return dependencies
    }

    private async readImports(content: string) {
        this._totalLines += content.split(DependencyGraphConstants.newlineRegex).length
        const regExp = new RegExp(importRegex)
        return content.match(regExp) ?? []
    }

    override async searchDependency(uri: vscode.Uri): Promise<Set<string>> {
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
                const content: string = await readFileAsString(uri.fsPath)
                const imports = await this.readImports(content)
                const dependencies = this.getDependencies(uri, imports)
                dependencies.forEach(dependency => {
                    q.push(dependency)
                })
            }
        }
        return this._pickedSourceFiles
    }

    override async traverseDir(dirPath: string) {
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
                    file.name.endsWith(DependencyGraphConstants.csharpExt) &&
                    !this.reachSizeLimit(this._totalSize) &&
                    !this.willReachSizeLimit(this._totalSize, statSync(absPath).size) &&
                    !this._pickedSourceFiles.has(absPath)
                ) {
                    await this.searchDependency(vscode.Uri.file(absPath))
                }
            }
        })
    }

    override async generateTruncation(uri: vscode.Uri): Promise<Truncation> {
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

    //If Import statement includes below libraries, this file will be treated as a Test File.
    override async isTestFile(content: string): Promise<boolean> {
        const imports = await this.readImports(content)
        const filteredImport = imports.filter(importStr => {
            return (
                importStr.includes('Xunit') ||
                importStr.includes('NUnit.Framework') ||
                importStr.includes('Microsoft.VisualStudio.TestTools.UnitTesting')
            )
        })
        return filteredImport.length > 0
    }

    /* New function added to fetch package path for a given file. 
    /* It is used for fetching cross-file context. 
    */
    override async getSourceDependencies(uri: vscode.Uri, content: string): Promise<string[]> {
        const imports = await this.readImports(content)
        const dependencies = this.getDependencies(uri, imports)
        return dependencies
    }

    /* New function added to fetch package path for a given file. 
    /* It is used for fetching cross-file context. 
    */
    override async getSamePackageFiles(uri: vscode.Uri, projectPath: string): Promise<string[]> {
        const fileList: string[] = []
        const packagePath = path.dirname(uri.fsPath)
        readdirSync(packagePath, { withFileTypes: true }).forEach(file => {
            fileList.push(path.join(packagePath, file.name))
        })
        return fileList
    }
}

export class CsharpDependencyGraphError extends Error {}
