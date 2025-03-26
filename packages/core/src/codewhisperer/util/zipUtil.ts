/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import path from 'path'
import { tempDirPath } from '../../shared/filesystemUtilities'
import { getLogger, getNullLogger } from '../../shared/logger/logger'
import * as CodeWhispererConstants from '../models/constants'
import { fs } from '../../shared/fs/fs'
import { runtimeLanguageContext } from './runtimeLanguageContext'
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import { CurrentWsFolders, collectFiles, getWorkspacePaths } from '../../shared/utilities/workspaceUtils'
import {
    FileSizeExceededError,
    NoActiveFileError,
    NoSourceFilesError,
    ProjectSizeExceededError,
} from '../models/errors'
import { normalize } from '../../shared/utilities/pathUtils'
import { ZipStream } from '../../shared/utilities/zipStream'
import { getTextContent } from '../../shared/utilities/textDocumentUtilities'
import { ChildProcess, ChildProcessOptions } from '../../shared/utilities/processUtils'
import { removeAnsi } from '../../shared/utilities/textUtilities'
import { isFileOpenAndDirty } from '../../shared/utilities/vsCodeUtils'
import { ToolkitError } from '../../shared/errors'

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

export interface ZipProjectOptions {
    projectPath?: string
    includeGitDiff?: boolean
    metadataDir?: string
    includeNonWorkspaceFiles?: boolean
    silent?: boolean
}

export const ZipConstants = {
    newlineRegex: /\r?\n/,
    gitignoreFilename: '.gitignore',
    knownBinaryFileExts: ['.class'],
    codeDiffFilePath: 'codeDiff/code.diff',
}

type ZipType = 'file' | 'project'
type PayloadLimits = Record<ZipType, number> & { [K in ZipType]: number }

export class ZipUtil {
    protected _pickedSourceFiles: Set<string> = new Set<string>()
    protected _pickedBuildFiles: Set<string> = new Set<string>()
    protected _totalSize: number = 0
    protected _zipDir: string = ''
    protected _totalBuildSize: number = 0
    protected _tmpDir: string = tempDirPath
    protected _totalLines: number = 0
    protected _fetchedDirs: Set<string> = new Set<string>()
    protected _language: CodewhispererLanguage | undefined
    protected _timestamp: string = Date.now().toString()
    protected _payloadByteLimits: PayloadLimits
    constructor(
        protected _zipDirPrefix: string,
        payloadLimits?: PayloadLimits
    ) {
        this._payloadByteLimits = payloadLimits ?? {
            file: CodeWhispererConstants.fileScanPayloadSizeLimitBytes,
            project: CodeWhispererConstants.projectScanPayloadSizeLimitBytes,
        }
    }

    public aboveByteLimit(size: number, limitType: ZipType): boolean {
        return size > this._payloadByteLimits[limitType]
    }

    public willReachProjectByteLimit(current: number, adding: number): boolean {
        return this.aboveByteLimit(current + adding, 'project')
    }

    public async zipFile(uri: vscode.Uri | undefined, includeGitDiffHeader?: boolean) {
        if (!uri) {
            throw new NoActiveFileError()
        }
        const zip = new ZipStream()

        const content = await getTextContent(uri)

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
        if (workspaceFolder) {
            // Note: workspaceFolder.name is not the same as the file system folder name,
            // use the fsPath value instead
            const projectName = path.basename(workspaceFolder.uri.fsPath)
            // Set includeWorkspaceFolder to false because we are already manually prepending the projectName
            const relativePath = vscode.workspace.asRelativePath(uri, false)
            const zipEntryPath = this.getZipEntryPath(projectName, relativePath)
            zip.writeString(content, zipEntryPath)

            if (includeGitDiffHeader) {
                const gitDiffContent = `+++ b/${normalize(zipEntryPath)}` // Sending file path in payload for LLM code review
                zip.writeString(gitDiffContent, ZipConstants.codeDiffFilePath)
            }
        } else {
            zip.writeString(content, uri.fsPath)
        }

        this._pickedSourceFiles.add(uri.fsPath)
        this._totalSize += (await fs.stat(uri.fsPath)).size
        this._totalLines += content.split(ZipConstants.newlineRegex).length

        if (this.aboveByteLimit(this._totalSize, 'file')) {
            throw new FileSizeExceededError()
        }
        const zipDirPath = this.getZipDirPath()
        const zipFilePath = zipDirPath + CodeWhispererConstants.codeScanZipExt
        await zip.finalizeToFile(zipFilePath)
        return this.getGenerateZipResult(zipDirPath, zipFilePath)
    }

    protected getZipEntryPath(projectName: string, relativePath: string) {
        return path.join(projectName, relativePath)
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
    protected async processMetadataDir(zip: ZipStream, metadataDir: string) {
        const metadataDirName = path.basename(metadataDir)
        // Helper function to add empty directory to zip
        const addEmptyDirectory = (dirPath: string) => {
            const relativePath = path.relative(metadataDir, dirPath)
            const pathWithMetadata = path.join(metadataDirName, relativePath, '/')
            zip.writeString('', pathWithMetadata)
        }

        // Recursive function to process directories
        const processDirectory = async (dirPath: string) => {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath))
            addEmptyDirectory(dirPath)

            for (const [fileName, fileType] of entries) {
                const filePath = path.join(dirPath, fileName)

                if (fileType === vscode.FileType.File) {
                    try {
                        const fileUri = vscode.Uri.file(filePath)
                        const relativePath = path.relative(metadataDir, filePath)
                        const pathWithMetadata = path.join(metadataDirName, relativePath)
                        zip.writeFile(fileUri.fsPath, pathWithMetadata)
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

    public async zipProject(
        workspaceFolders: CurrentWsFolders,
        excludePatterns: string[],
        options?: ZipProjectOptions
    ) {
        const zip = new ZipStream()
        const projectPaths = options?.projectPath ? [options?.projectPath] : getWorkspacePaths()
        if (options?.includeGitDiff) {
            await this.processCombinedGitDiff(zip, projectPaths, '')
        }
        const languageCount = new Map<CodewhispererLanguage, number>()

        await this.processSourceFiles(zip, languageCount, projectPaths, workspaceFolders, excludePatterns)
        if (options?.metadataDir) {
            await this.processMetadataDir(zip, options.metadataDir)
        }
        if (options?.includeNonWorkspaceFiles) {
            this.processOtherFiles(zip, languageCount)
        }

        if (languageCount.size === 0) {
            throw new NoSourceFilesError()
        }
        const zipDirPath = this.getZipDirPath()
        this._language = [...languageCount.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
        const zipFilePath = zipDirPath + CodeWhispererConstants.codeScanZipExt
        await zip.finalizeToFile(zipFilePath)
        return this.getGenerateZipResult(zipDirPath, zipFilePath)
    }

    protected async processCombinedGitDiff(zip: ZipStream, projectPaths: string[], filePath?: string) {
        const gitDiffContent = await getGitDiffContentForProjects(projectPaths, filePath)
        if (gitDiffContent) {
            zip.writeString(gitDiffContent, ZipConstants.codeDiffFilePath)
        }
    }

    protected async processSourceFiles(
        zip: ZipStream,
        languageCount: Map<CodewhispererLanguage, number>,
        projectPaths: string[] | undefined,
        workspaceFolders: CurrentWsFolders,
        excludePatterns: string[],
        includeBinary?: boolean
    ) {
        if (!projectPaths || projectPaths.length === 0) {
            return
        }
        const sourceFiles = await collectFiles(projectPaths, workspaceFolders, {
            maxTotalSizeBytes: this._payloadByteLimits['project'],
            excludePatterns,
        }).catch((e) => {
            // Check if project is too large to collect.
            if (e instanceof ToolkitError && e.code === 'ContentLengthError') {
                throw new ProjectSizeExceededError()
            }
            throw e
        })
        for (const file of sourceFiles) {
            const projectName = path.basename(file.workspaceFolder.uri.fsPath)
            const zipEntryPath = this.getZipEntryPath(projectName, file.relativeFilePath)

            if (ZipConstants.knownBinaryFileExts.includes(path.extname(file.fileUri.fsPath)) && includeBinary) {
                await this.processBinaryFile(zip, file.fileUri, zipEntryPath)
            } else {
                const hasUnsavedChanges = isFileOpenAndDirty(file.fileUri)
                const fileContent = hasUnsavedChanges ? await getTextContent(file.fileUri) : file.fileContent
                this.processTextFile(zip, file.fileUri, fileContent, languageCount, zipEntryPath)
            }
        }
    }

    protected processOtherFiles(zip: ZipStream, languageCount: Map<CodewhispererLanguage, number>) {
        for (const document of vscode.workspace.textDocuments
            .filter((document) => document.uri.scheme === 'file')
            .filter((document) => vscode.workspace.getWorkspaceFolder(document.uri) === undefined)) {
            this.processTextFile(zip, document.uri, document.getText(), languageCount, document.uri.fsPath)
        }
    }

    protected processTextFile(
        zip: ZipStream,
        uri: vscode.Uri,
        fileContent: string,
        languageCount: Map<CodewhispererLanguage, number>,
        zipEntryPath: string
    ) {
        const fileSize = Buffer.from(fileContent).length

        if (this.willReachProjectByteLimit(this._totalSize, fileSize)) {
            throw new ProjectSizeExceededError()
        }
        this._pickedSourceFiles.add(uri.fsPath)
        this._totalSize += fileSize
        this._totalLines += fileContent.split(ZipConstants.newlineRegex).length

        this.incrementCountForLanguage(uri, languageCount)
        zip.writeString(fileContent, zipEntryPath)
    }

    protected async processBinaryFile(zip: ZipStream, uri: vscode.Uri, zipEntryPath: string) {
        const fileSize = (await fs.stat(uri.fsPath)).size

        if (this.willReachProjectByteLimit(this._totalSize, fileSize)) {
            throw new ProjectSizeExceededError()
        }
        this._pickedSourceFiles.add(uri.fsPath)
        this._totalSize += fileSize

        zip.writeFile(uri.fsPath, path.dirname(zipEntryPath))
    }

    protected incrementCountForLanguage(uri: vscode.Uri, languageCount: Map<CodewhispererLanguage, number>) {
        const fileExtension = path.extname(uri.fsPath).slice(1)
        const language = runtimeLanguageContext.getLanguageFromFileExtension(fileExtension)
        if (language && language !== 'plaintext') {
            languageCount.set(language, (languageCount.get(language) || 0) + 1)
        }
    }

    public getZipDirPath(): string {
        if (this._zipDir === '') {
            this._zipDir = path.join(this._tmpDir, `${this._zipDirPrefix}_${this._timestamp}`)
        }
        return this._zipDir
    }

    protected async getGenerateZipResult(
        zipDirpath: string,
        zipFilePath: string,
        silent?: boolean
    ): Promise<ZipMetadata> {
        if (!silent) {
            getLogger().debug(`Picked source files: [${[...this._pickedSourceFiles].join(', ')}]`)
        }
        return {
            rootDir: zipDirpath,
            zipFilePath: zipFilePath,
            srcPayloadSizeInBytes: this._totalSize,
            scannedFiles: new Set(this._pickedSourceFiles),
            zipFileSizeInBytes: (await fs.stat(zipFilePath)).size,
            buildPayloadSizeInBytes: this._totalBuildSize,
            lines: this._totalLines,
            language: this._language,
        }
    }
    // TODO: Refactor this
    public async removeTmpFiles(zipMetadata: ZipMetadata, silent?: boolean) {
        const logger = silent ? getNullLogger() : getLogger()
        logger.verbose(`Cleaning up temporary files...`)
        await fs.delete(zipMetadata.zipFilePath, { force: true })
        await fs.delete(zipMetadata.rootDir, { recursive: true, force: true })
        logger.verbose(`Complete cleaning up temporary files.`)
    }
}

// TODO: port this to its own utility with tests.
interface GitDiffOptions {
    projectPath: string
    projectName: string
    filepath?: string
    zipType?: ZipType
}

async function getGitDiffContentForProjects(projectPaths: string[], filepath?: string) {
    let gitDiffContent = ''
    for (const projectPath of projectPaths) {
        const projectName = path.basename(projectPath)
        gitDiffContent += await getGitDiffContent({
            projectPath,
            projectName,
            filepath,
            zipType: 'project',
        })
    }
    return gitDiffContent
}

async function getGitDiffContent(options: GitDiffOptions): Promise<string> {
    const { projectPath, projectName, filepath: filePath } = options

    const isProjectScope = options.zipType === 'project'
    const untrackedFilesString = await getGitUntrackedFiles(projectPath)
    const untrackedFilesArray = untrackedFilesString?.trim()?.split('\n')?.filter(Boolean)

    if (isProjectScope && untrackedFilesArray && !untrackedFilesArray.length) {
        return await generateHeadDiff(projectPath, projectName)
    }

    let diffContent = ''

    if (isProjectScope) {
        diffContent = await generateHeadDiff(projectPath, projectName)

        if (untrackedFilesArray) {
            const untrackedDiffs = await Promise.all(
                untrackedFilesArray.map((file) => generateNewFileDiff(projectPath, projectName, file))
            )
            diffContent += untrackedDiffs.join('')
        }
    } else if (!isProjectScope && filePath) {
        const relativeFilePath = path.relative(projectPath, filePath)

        const newFileDiff = await generateNewFileDiff(projectPath, projectName, relativeFilePath)
        diffContent = rewriteDiff(newFileDiff)
    }
    return diffContent
}

async function getGitUntrackedFiles(projectPath: string): Promise<string | undefined> {
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

async function generateHeadDiff(projectPath: string, projectName: string, relativePath?: string): Promise<string> {
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
            getLogger().verbose(removeAnsi(text))
        },
        onStderr: (text) => {
            getLogger().error(removeAnsi(text))
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

async function generateNewFileDiff(projectPath: string, projectName: string, relativePath: string): Promise<string> {
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
            getLogger().verbose(removeAnsi(text))
        },
        onStderr: (text) => {
            getLogger().error(removeAnsi(text))
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

function rewriteDiff(inputStr: string): string {
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
