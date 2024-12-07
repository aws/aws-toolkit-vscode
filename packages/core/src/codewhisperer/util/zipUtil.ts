/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import admZip from 'adm-zip'
import * as vscode from 'vscode'
import path from 'path'
import { tempDirPath, testGenerationLogsDir } from '../../shared/filesystemUtilities'
import { getLogger } from '../../shared/logger'
import * as CodeWhispererConstants from '../models/constants'
import { ToolkitError } from '../../shared/errors'
import { fs } from '../../shared/fs/fs'
import { getLoggerForScope } from '../service/securityScanHandler'
import { runtimeLanguageContext } from './runtimeLanguageContext'
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import { CurrentWsFolders, collectFiles } from '../../shared/utilities/workspaceUtils'
import {
    FileSizeExceededError,
    NoActiveFileError,
    NoSourceFilesError,
    ProjectSizeExceededError,
} from '../models/errors'
import { ZipUseCase } from '../models/constants'
import { ChildProcess, ChildProcessOptions } from '../../shared/utilities/processUtils'
import { showOutputMessage } from '../../shared/utilities/messages'
import { globals, removeAnsi } from '../../shared'

export interface ZipMetadata {
    rootDir: string
    zipFilePath: string
    scannedFiles: Set<string>
    srcPayloadSizeInBytes: number
    buildPayloadSizeInBytes: number
    zipFileSizeInBytes: number
    lines: number
    language: CodewhispererLanguage | undefined
}

export const ZipConstants = {
    newlineRegex: /\r?\n/,
    gitignoreFilename: '.gitignore',
    knownBinaryFileExts: ['.class'],
    codeDiffFilePath: 'codeDiff/code.diff',
}

interface GitDiffOptions {
    projectPath: string
    projectName: string
    filePath?: string
    scope?: CodeWhispererConstants.CodeAnalysisScope
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
    protected _language: CodewhispererLanguage | undefined
    protected _timestamp: string = Date.now().toString()
    constructor() {}

    getFileScanPayloadSizeLimitInBytes(): number {
        return CodeWhispererConstants.fileScanPayloadSizeLimitBytes
    }

    getProjectScanPayloadSizeLimitInBytes(): number {
        return CodeWhispererConstants.projectScanPayloadSizeLimitBytes
    }

    public getProjectPaths() {
        const workspaceFolders = vscode.workspace.workspaceFolders
        return workspaceFolders?.map((folder) => folder.uri.fsPath) ?? []
    }

    public getProjectPath(filePath: string) {
        const fileUri = vscode.Uri.file(filePath)
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri)
        return workspaceFolder?.uri.fsPath
    }

    protected async getTextContent(uri: vscode.Uri) {
        const document = await vscode.workspace.openTextDocument(uri)
        const content = document.getText()
        return content
    }

    public reachSizeLimit(size: number, scope: CodeWhispererConstants.CodeAnalysisScope): boolean {
        if (
            scope === CodeWhispererConstants.CodeAnalysisScope.FILE_AUTO ||
            scope === CodeWhispererConstants.CodeAnalysisScope.FILE_ON_DEMAND
        ) {
            return size > this.getFileScanPayloadSizeLimitInBytes()
        } else {
            return size > this.getProjectScanPayloadSizeLimitInBytes()
        }
    }

    public willReachSizeLimit(current: number, adding: number): boolean {
        const willReachLimit = current + adding > this.getProjectScanPayloadSizeLimitInBytes()
        return willReachLimit
    }

    protected async zipFile(uri: vscode.Uri | undefined, scope: CodeWhispererConstants.CodeAnalysisScope) {
        if (!uri) {
            throw new NoActiveFileError()
        }
        const zip = new admZip()

        const content = await this.getTextContent(uri)

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
        if (workspaceFolder) {
            // Note: workspaceFolder.name is not the same as the file system folder name,
            // use the fsPath value instead
            const projectName = path.basename(workspaceFolder.uri.fsPath)
            const relativePath = vscode.workspace.asRelativePath(uri)
            const zipEntryPath = this.getZipEntryPath(projectName, relativePath)
            zip.addFile(zipEntryPath, Buffer.from(content, 'utf-8'))

            if (scope === CodeWhispererConstants.CodeAnalysisScope.FILE_ON_DEMAND) {
                const gitDiffContent = `+++ b/${path.normalize(zipEntryPath)}` // Sending file path in payload for LLM code review
                zip.addFile(ZipConstants.codeDiffFilePath, Buffer.from(gitDiffContent, 'utf-8'))
            }
        } else {
            zip.addFile(uri.fsPath, Buffer.from(content, 'utf-8'))
        }

        this._pickedSourceFiles.add(uri.fsPath)
        this._totalSize += (await fs.stat(uri.fsPath)).size
        this._totalLines += content.split(ZipConstants.newlineRegex).length

        if (this.reachSizeLimit(this._totalSize, scope)) {
            throw new FileSizeExceededError()
        }
        const zipFilePath = this.getZipDirPath(ZipUseCase.CODE_SCAN) + CodeWhispererConstants.codeScanZipExt
        zip.writeZip(zipFilePath)
        return zipFilePath
    }

    protected getZipEntryPath(projectName: string, relativePath: string, useCase?: ZipUseCase) {
        // Workspaces with multiple folders have the folder names as the root folder,
        // but workspaces with only a single folder don't. So prepend the workspace folder name
        // if it is not present.
        if (useCase === ZipUseCase.TEST_GENERATION) {
            return path.join(projectName, relativePath)
        }
        return relativePath.split('/').shift() === projectName ? relativePath : path.join(projectName, relativePath)
    }

    /**
     * Processes a directory and adds its contents to a zip archive while preserving the directory structure.
     *
     * @param zip - The AdmZip instance to add files and directories to
     * @param metadataDir - The absolute path to the directory to process
     *
     * @remarks
     * This function:
     * - Creates empty directory entries in the zip for each directory
     * - Recursively processes all subdirectories
     * - Adds all files to the zip while maintaining relative paths
     * - Handles errors for individual file operations without stopping the overall process
     *
     * The files in the zip will be stored under a root directory named after the input directory's basename.
     *
     * @throws May throw errors from filesystem operations or zip creation
     *
     * @example
     * ```typescript
     * const zip = new AdmZip();
     * await processMetadataDir(zip, '/path/to/directory');
     * ```
     */
    protected async processMetadataDir(zip: admZip, metadataDir: string) {
        const metadataDirName = path.basename(metadataDir)
        // Helper function to add empty directory to zip
        const addEmptyDirectory = (dirPath: string) => {
            const relativePath = path.relative(metadataDir, dirPath)
            const pathWithMetadata = path.join(metadataDirName, relativePath, '/')
            zip.addFile(pathWithMetadata, Buffer.from(''))
        }

        // Recursive function to process directories
        const processDirectory = async (dirPath: string) => {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath))
            addEmptyDirectory(dirPath)

            for (const [fileName, fileType] of entries) {
                const filePath = path.join(dirPath, fileName)

                if (fileType === vscode.FileType.File) {
                    try {
                        const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))
                        const buffer = Buffer.from(fileContent)
                        const relativePath = path.relative(metadataDir, filePath)
                        const pathWithMetadata = path.join(metadataDirName, relativePath)
                        zip.addFile(pathWithMetadata, buffer)
                    } catch (error) {
                        getLogger().error(`Failed to add file ${filePath} to zip: ${error}`)
                    }
                } else if (fileType === vscode.FileType.Directory) {
                    // Recursively process subdirectory
                    await processDirectory(filePath)
                }
            }
        }
        await processDirectory(metadataDir)
    }

    protected async zipProject(useCase: ZipUseCase, projectPath?: string, metadataDir?: string) {
        const zip = new admZip()
        let projectPaths = []
        if (useCase === ZipUseCase.TEST_GENERATION && projectPath) {
            projectPaths.push(projectPath)
        } else {
            projectPaths = this.getProjectPaths()
        }
        if (useCase === ZipUseCase.CODE_SCAN) {
            await this.processCombinedGitDiff(zip, projectPaths, '', CodeWhispererConstants.CodeAnalysisScope.PROJECT)
        }
        const languageCount = new Map<CodewhispererLanguage, number>()

        await this.processSourceFiles(zip, languageCount, projectPaths, useCase)
        if (metadataDir) {
            await this.processMetadataDir(zip, metadataDir)
        }
        if (useCase !== ZipUseCase.TEST_GENERATION) {
            this.processOtherFiles(zip, languageCount)
        }

        if (languageCount.size === 0) {
            throw new NoSourceFilesError()
        }
        this._language = [...languageCount.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
        const zipFilePath = this.getZipDirPath(useCase) + CodeWhispererConstants.codeScanZipExt
        zip.writeZip(zipFilePath)
        return zipFilePath
    }

    protected async processCombinedGitDiff(
        zip: admZip,
        projectPaths: string[],
        filePath?: string,
        scope?: CodeWhispererConstants.CodeAnalysisScope
    ) {
        let gitDiffContent = ''
        for (const projectPath of projectPaths) {
            const projectName = path.basename(projectPath)
            // Get diff content
            gitDiffContent += await this.executeGitDiff({
                projectPath,
                projectName,
                filePath,
                scope,
            })
        }
        if (gitDiffContent) {
            zip.addFile(ZipConstants.codeDiffFilePath, Buffer.from(gitDiffContent, 'utf-8'))
        }
    }

    private async getGitUntrackedFiles(projectPath: string): Promise<string | undefined> {
        const checkNewFileArgs = ['ls-files', '--others', '--exclude-standard']
        const checkProcess = new ChildProcess('git', checkNewFileArgs)

        try {
            let output = ''
            await checkProcess.run({
                rejectOnError: true,
                rejectOnErrorCode: true,
                onStdout: (text) => {
                    output += text
                },
                spawnOptions: {
                    cwd: projectPath,
                },
            })
            return output
        } catch (err) {
            getLogger().warn(`Failed to check if file is new: ${err}`)
            return undefined
        }
    }

    private async generateNewFileDiff(projectPath: string, projectName: string, relativePath: string): Promise<string> {
        let diffContent = ''

        const gitArgs = [
            'diff',
            '--no-index',
            `--src-prefix=a/${projectName}/`,
            `--dst-prefix=b/${projectName}/`,
            '/dev/null', // Use /dev/null as the old file
            relativePath,
        ]

        const childProcess = new ChildProcess('git', gitArgs)
        const runOptions: ChildProcessOptions = {
            rejectOnError: false,
            rejectOnErrorCode: false,
            onStdout: (text) => {
                diffContent += text
                showOutputMessage(removeAnsi(text), globals.outputChannel)
            },
            onStderr: (text) => {
                showOutputMessage(removeAnsi(text), globals.outputChannel)
            },
            spawnOptions: {
                cwd: projectPath,
            },
        }

        try {
            await childProcess.run(runOptions)
            return diffContent
        } catch (err) {
            getLogger().warn(`Failed to run diff command: ${err}`)
            return ''
        }
    }

    private async generateHeadDiff(projectPath: string, projectName: string, relativePath?: string): Promise<string> {
        let diffContent = ''

        const gitArgs = [
            'diff',
            'HEAD',
            `--src-prefix=a/${projectName}/`,
            `--dst-prefix=b/${projectName}/`,
            ...(relativePath ? [relativePath] : []),
        ]

        const childProcess = new ChildProcess('git', gitArgs)

        const runOptions: ChildProcessOptions = {
            rejectOnError: true,
            rejectOnErrorCode: true,
            onStdout: (text) => {
                diffContent += text
                showOutputMessage(removeAnsi(text), globals.outputChannel)
            },
            onStderr: (text) => {
                showOutputMessage(removeAnsi(text), globals.outputChannel)
            },
            spawnOptions: {
                cwd: projectPath,
            },
        }

        try {
            await childProcess.run(runOptions)
            return diffContent
        } catch (err) {
            getLogger().warn(`Failed to run command \`${childProcess.toString()}\`: ${err}`)
            return ''
        }
    }

    private async executeGitDiff(options: GitDiffOptions): Promise<string> {
        const { projectPath, projectName, filePath, scope } = options
        const isProjectScope = scope === CodeWhispererConstants.CodeAnalysisScope.PROJECT

        const untrackedFilesString = await this.getGitUntrackedFiles(projectPath)
        const untrackedFilesArray = untrackedFilesString?.trim()?.split('\n')?.filter(Boolean)

        if (isProjectScope && untrackedFilesArray && !untrackedFilesArray.length) {
            return await this.generateHeadDiff(projectPath, projectName)
        }

        let diffContent = ''

        if (isProjectScope) {
            diffContent = await this.generateHeadDiff(projectPath, projectName)

            if (untrackedFilesArray) {
                const untrackedDiffs = await Promise.all(
                    untrackedFilesArray.map((file) => this.generateNewFileDiff(projectPath, projectName, file))
                )
                diffContent += untrackedDiffs.join('')
            }
        } else if (!isProjectScope && filePath) {
            const relativeFilePath = path.relative(projectPath, filePath)

            const newFileDiff = await this.generateNewFileDiff(projectPath, projectName, relativeFilePath)
            diffContent = this.rewriteDiff(newFileDiff)
        }
        return diffContent
    }

    private rewriteDiff(inputStr: string): string {
        const lines = inputStr.split('\n')
        const rewrittenLines = lines.slice(0, 5).map((line) => {
            line = line.replace(/\\\\/g, '/')
            line = line.replace(/("a\/[^"]*)/g, (match, p1) => p1)
            line = line.replace(/("b\/[^"]*)/g, (match, p1) => p1)
            line = line.replace(/"/g, '')

            return line
        })
        const outputLines = [...rewrittenLines, ...lines.slice(5)]
        const outputStr = outputLines.join('\n')

        return outputStr
    }

    protected async processSourceFiles(
        zip: admZip,
        languageCount: Map<CodewhispererLanguage, number>,
        projectPaths: string[] | undefined,
        useCase: ZipUseCase
    ) {
        if (!projectPaths || projectPaths.length === 0) {
            return
        }

        const sourceFiles = await collectFiles(
            projectPaths,
            vscode.workspace.workspaceFolders as CurrentWsFolders,
            true,
            this.getProjectScanPayloadSizeLimitInBytes()
        )
        for (const file of sourceFiles) {
            const zipEntryPath = this.getZipEntryPath(file.workspaceFolder.name, file.relativeFilePath, useCase)

            if (ZipConstants.knownBinaryFileExts.includes(path.extname(file.fileUri.fsPath))) {
                if (useCase === ZipUseCase.TEST_GENERATION) {
                    continue
                }
                await this.processBinaryFile(zip, file.fileUri, zipEntryPath)
            } else {
                const isFileOpenAndDirty = this.isFileOpenAndDirty(file.fileUri)
                const fileContent = isFileOpenAndDirty ? await this.getTextContent(file.fileUri) : file.fileContent
                this.processTextFile(zip, file.fileUri, fileContent, languageCount, zipEntryPath)
            }
        }
    }

    protected processOtherFiles(zip: admZip, languageCount: Map<CodewhispererLanguage, number>) {
        vscode.workspace.textDocuments
            .filter((document) => document.uri.scheme === 'file')
            .filter((document) => vscode.workspace.getWorkspaceFolder(document.uri) === undefined)
            .forEach((document) =>
                this.processTextFile(zip, document.uri, document.getText(), languageCount, document.uri.fsPath)
            )
    }

    protected async processTestCoverageFiles(targetPath: string) {
        // TODO: will be removed post release
        const coverageFilePatterns = ['**/coverage.xml', '**/coverage.json', '**/coverage.txt']
        let files: vscode.Uri[] = []

        for (const pattern of coverageFilePatterns) {
            files = await vscode.workspace.findFiles(pattern)
            if (files.length > 0) {
                break
            }
        }

        await Promise.all(
            files.map(async (file) => {
                const fileName = path.basename(file.path)
                const targetFilePath = path.join(targetPath, fileName)
                await fs.copy(file.path, targetFilePath)
            })
        )
    }

    protected processTextFile(
        zip: admZip,
        uri: vscode.Uri,
        fileContent: string,
        languageCount: Map<CodewhispererLanguage, number>,
        zipEntryPath: string
    ) {
        const fileSize = Buffer.from(fileContent).length

        if (
            this.reachSizeLimit(this._totalSize, CodeWhispererConstants.CodeAnalysisScope.PROJECT) ||
            this.willReachSizeLimit(this._totalSize, fileSize)
        ) {
            throw new ProjectSizeExceededError()
        }
        this._pickedSourceFiles.add(uri.fsPath)
        this._totalSize += fileSize
        this._totalLines += fileContent.split(ZipConstants.newlineRegex).length

        this.incrementCountForLanguage(uri, languageCount)
        zip.addFile(zipEntryPath, Buffer.from(fileContent, 'utf-8'))
    }

    protected async processBinaryFile(zip: admZip, uri: vscode.Uri, zipEntryPath: string) {
        const fileSize = (await fs.stat(uri.fsPath)).size

        if (
            this.reachSizeLimit(this._totalSize, CodeWhispererConstants.CodeAnalysisScope.PROJECT) ||
            this.willReachSizeLimit(this._totalSize, fileSize)
        ) {
            throw new ProjectSizeExceededError()
        }
        this._pickedSourceFiles.add(uri.fsPath)
        this._totalSize += fileSize

        zip.addLocalFile(uri.fsPath, path.dirname(zipEntryPath))
    }

    protected incrementCountForLanguage(uri: vscode.Uri, languageCount: Map<CodewhispererLanguage, number>) {
        const fileExtension = path.extname(uri.fsPath).slice(1)
        const language = runtimeLanguageContext.getLanguageFromFileExtension(fileExtension)
        if (language && language !== 'plaintext') {
            languageCount.set(language, (languageCount.get(language) || 0) + 1)
        }
    }

    protected isFileOpenAndDirty(uri: vscode.Uri) {
        return vscode.workspace.textDocuments.some((document) => document.uri.fsPath === uri.fsPath && document.isDirty)
    }

    public getZipDirPath(useCase: ZipUseCase): string {
        if (this._zipDir === '') {
            const prefix =
                useCase === ZipUseCase.TEST_GENERATION
                    ? CodeWhispererConstants.TestGenerationTruncDirPrefix
                    : CodeWhispererConstants.codeScanTruncDirPrefix

            this._zipDir = path.join(this._tmpDir, `${prefix}_${this._timestamp}`)
        }
        return this._zipDir
    }

    public async generateZip(
        uri: vscode.Uri | undefined,
        scope: CodeWhispererConstants.CodeAnalysisScope
    ): Promise<ZipMetadata> {
        try {
            const zipDirPath = this.getZipDirPath(ZipUseCase.CODE_SCAN)
            let zipFilePath: string
            if (
                scope === CodeWhispererConstants.CodeAnalysisScope.FILE_AUTO ||
                scope === CodeWhispererConstants.CodeAnalysisScope.FILE_ON_DEMAND
            ) {
                zipFilePath = await this.zipFile(uri, scope)
            } else if (scope === CodeWhispererConstants.CodeAnalysisScope.PROJECT) {
                zipFilePath = await this.zipProject(ZipUseCase.CODE_SCAN)
            } else {
                throw new ToolkitError(`Unknown code analysis scope: ${scope}`)
            }

            getLoggerForScope(scope).debug(`Picked source files: [${[...this._pickedSourceFiles].join(', ')}]`)
            const zipFileSize = (await fs.stat(zipFilePath)).size
            return {
                rootDir: zipDirPath,
                zipFilePath: zipFilePath,
                srcPayloadSizeInBytes: this._totalSize,
                scannedFiles: new Set([...this._pickedSourceFiles, ...this._pickedBuildFiles]),
                zipFileSizeInBytes: zipFileSize,
                buildPayloadSizeInBytes: this._totalBuildSize,
                lines: this._totalLines,
                language: this._language,
            }
        } catch (error) {
            getLogger().error('Zip error caused by: %O', error)
            throw error
        }
    }

    public async generateZipTestGen(projectPath: string, initialExecution: boolean): Promise<ZipMetadata> {
        try {
            // const repoMapFile = await LspClient.instance.getRepoMapJSON()
            const zipDirPath = this.getZipDirPath(ZipUseCase.TEST_GENERATION)

            const metadataDir = path.join(zipDirPath, 'utgRequiredArtifactsDir')

            // Create directories
            const dirs = {
                metadata: metadataDir,
                buildAndExecuteLogDir: path.join(metadataDir, 'buildAndExecuteLogDir'),
                repoMapDir: path.join(metadataDir, 'repoMapData'),
                testCoverageDir: path.join(metadataDir, 'testCoverageDir'),
            }
            await Promise.all(Object.values(dirs).map((dir) => fs.mkdir(dir)))

            // if (await fs.exists(repoMapFile)) {
            //     await fs.copy(repoMapFile, path.join(dirs.repoMapDir, 'repoMapData.json'))
            //     await fs.delete(repoMapFile)
            // }

            if (!initialExecution) {
                await this.processTestCoverageFiles(dirs.testCoverageDir)

                const sourcePath = path.join(testGenerationLogsDir, 'output.log')
                const targetPath = path.join(dirs.buildAndExecuteLogDir, 'output.log')
                if (await fs.exists(sourcePath)) {
                    await fs.copy(sourcePath, targetPath)
                }
            }

            const zipFilePath: string = await this.zipProject(ZipUseCase.TEST_GENERATION, projectPath, metadataDir)
            const zipFileSize = (await fs.stat(zipFilePath)).size
            return {
                rootDir: zipDirPath,
                zipFilePath: zipFilePath,
                srcPayloadSizeInBytes: this._totalSize,
                scannedFiles: new Set(this._pickedSourceFiles),
                zipFileSizeInBytes: zipFileSize,
                buildPayloadSizeInBytes: this._totalBuildSize,
                lines: this._totalLines,
                language: this._language,
            }
        } catch (error) {
            getLogger().error('Zip error caused by: %s', error)
            throw error
        }
    }
    // TODO: Refactor this
    public async removeTmpFiles(zipMetadata: ZipMetadata, scope?: CodeWhispererConstants.CodeAnalysisScope) {
        const logger = getLoggerForScope(scope)
        logger.verbose(`Cleaning up temporary files...`)
        await fs.delete(zipMetadata.zipFilePath, { force: true })
        await fs.delete(zipMetadata.rootDir, { recursive: true, force: true })
        logger.verbose(`Complete cleaning up temporary files.`)
    }
}
