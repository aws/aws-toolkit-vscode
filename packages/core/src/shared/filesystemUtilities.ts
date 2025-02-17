/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'crypto'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { getLogger } from './logger/logger'
import * as pathutils from './utilities/pathUtils'
import globals from '../shared/extensionGlobals'
import fs from '../shared/fs/fs'
import { ToolkitError } from './errors'
import * as nodeFs from 'fs/promises'

export const tempDirPath = path.join(
    // https://github.com/aws/aws-toolkit-vscode/issues/240
    os.type() === 'Darwin' ? '/tmp' : os.tmpdir(),
    'aws-toolkit-vscode'
)

export const testGenerationLogsDir = path.join(tempDirPath, 'testGenerationLogs')

export async function getDirSize(dirPath: string, startTime: number, duration: number): Promise<number> {
    if (performance.now() - startTime > duration) {
        getLogger().warn('getDirSize: exceeds time limit')
        return 0
    }
    const files = await fs.readdir(dirPath)
    const fileSizes = files.map(async (file) => {
        const [fileName, type] = file
        const filePath = path.join(dirPath, fileName)

        if (type === vscode.FileType.SymbolicLink) {
            return 0
        }
        if (type === vscode.FileType.Directory) {
            return getDirSize(filePath, startTime, duration)
        }
        if (type === vscode.FileType.File) {
            const stat = await fs.stat(filePath)
            return stat.size
        }

        return 0
    })
    return (await Promise.all(fileSizes)).reduce((accumulator, size) => accumulator + size, 0)
}

async function downloadsDir(): Promise<string> {
    const downloadPath = path.join(os.homedir(), 'Downloads')
    if (await fs.existsDir(downloadPath)) {
        return downloadPath
    } else {
        return os.tmpdir()
    }
}

/**
 * @deprecated use {@link fs} exist methods instead.
 * Checks if file or directory `p` exists.
 *
 * TODO: optionally check read/write permissions and return a granular status.
 */
export async function fileExists(p: string): Promise<boolean> {
    try {
        return fs.exists(p)
    } catch (err) {
        return false
    }

    return true
}

/**
 * @deprecated use {@link fs} exist methods instead.
 */
export async function readFileAsString(pathLike: string): Promise<string> {
    return fs.readFileText(pathLike)
}

/**
 * Best-effort delete a folder recursively. Will not throw if it fails.
 * @param folder The path to the folder to delete
 */
export async function tryRemoveFolder(folder?: string): Promise<boolean> {
    try {
        // if null or empty, no issues
        if (!folder) {
            getLogger().warn('tryRemoveFolder: no folder given')
            return false
        }
        await fs.delete(folder, { recursive: true, force: true })
    } catch (err) {
        getLogger().warn('tryRemoveFolder: failed to delete directory "%s": %O', folder, err as Error)
        return false
    }
    return true
}

/** Note: In tests use `createTestWorkspaceFolder` instead. */
export const makeTemporaryToolkitFolder = async (...relativePathParts: string[]) => {
    if (relativePathParts.length === 0) {
        relativePathParts.push('vsctk')
    }

    // Add random characters to the leaf folder to ensure it is unique
    relativePathParts[relativePathParts.length - 1] =
        relativePathParts[relativePathParts.length - 1] + crypto.randomBytes(4).toString('hex')

    const tmpPath = path.join(tempDirPath, ...relativePathParts)
    await fs.mkdir(tmpPath)
    return tmpPath
}

/**
 * Returns `true` if path `p` is a descendant of directory `d` (or if they are
 * identical).
 *
 * Only the logical structure is checked; the paths are not checked for
 * existence on the filesystem.
 *
 * @param d  Path to a directory.
 * @param p  Path to file or directory to test.
 */
export function isInDirectory(d: string, p: string): boolean {
    if (d === '' || p === '') {
        return true
    }
    const parentDirPieces = pathutils.normalizeSeparator(d).split('/')
    const containedPathPieces = pathutils.normalizeSeparator(p).split('/')

    if (parentDirPieces.length > containedPathPieces.length) {
        return false
    }

    // Remove final empty element(s), if `d` ends with slash(es).
    while (parentDirPieces.length > 0 && parentDirPieces[parentDirPieces.length - 1] === '') {
        parentDirPieces.pop()
    }
    const caseInsensitive = os.platform() === 'win32'

    return parentDirPieces.every((value, index) => {
        return caseInsensitive
            ? value.toLowerCase() === containedPathPieces[index].toLowerCase()
            : value === containedPathPieces[index]
    })
}

/**
 *
 * @returns file distance between fileA and fileB
 * For example:
 * The file distance between A/B/C.java and A/B/D.java is 0
 * The file distance between A/B/C.java and A/D.java is 1
 */
export function getFileDistance(fileA: string, fileB: string): number {
    let filePathA = pathutils.normalize(fileA).split('/')
    filePathA = filePathA.slice(0, filePathA.length - 1)

    let filePathB = pathutils.normalize(fileB).split('/')
    filePathB = filePathB.slice(0, filePathB.length - 1)

    let i = 0
    while (i < Math.min(filePathA.length, filePathB.length)) {
        const dir1 = filePathA[i]
        const dir2 = filePathB[i]

        if (dir1 !== dir2) {
            break
        }

        i++
    }

    return filePathA.slice(i).length + filePathB.slice(i).length
}

/**
 * Returns `name.suffix` if it does not already exist in directory `dir`, else appends
 * a number ("foo-1.txt", "foo-2.txt", etc.).
 *
 * To avoid excessive filesystem activity, if all filenames up to `max` exist,
 * the function instead appends a random string.
 *
 * @param dir  Path to a directory
 * @param name  Filename without extension
 * @param suffix  Filename suffix, typically an extension (".txt"), may be empty
 * @param max  Stop searching if all permutations up to this number exist
 */
export async function getNonexistentFilename(
    dir: string,
    name: string,
    suffix: string,
    max: number = 99
): Promise<string> {
    if (!name) {
        throw new Error(`name is empty`)
    }
    if (!(await fs.existsDir(dir))) {
        throw new Error(`directory does not exist: ${dir}`)
    }
    for (let i = 0; true; i++) {
        const filename =
            i === 0 ? `${name}${suffix}` : `${name}-${i < max ? i : crypto.randomBytes(4).toString('hex')}${suffix}`
        const fullpath = path.join(dir, filename)
        if (!(await fs.exists(fullpath)) || i >= max + 99) {
            return filename
        }
    }
}

/**
 * Searches for existence of at least one file with the passed suffix
 * @param dir Directory to search
 * @param suffix Suffix to look for (ex.".ts")
 * @param exclude Pattern to ignore
 * @returns True if at least one file is found with given suffix
 */
export async function hasFileWithSuffix(dir: string, suffix: string, exclude?: vscode.GlobPattern): Promise<boolean> {
    const searchFolder = `${dir}**/*${suffix}`
    const matchedFiles = await vscode.workspace.findFiles(searchFolder, exclude, 1)
    return matchedFiles.length > 0
}

/**
 * @returns  A string path to the last locally stored download location. If none, returns the users 'Downloads' directory path.
 */
export async function getDefaultDownloadPath(): Promise<string> {
    const lastUsedPath = globals.globalState.get('aws.downloadPath')
    if (lastUsedPath) {
        if (typeof lastUsedPath === 'string') {
            return lastUsedPath
        }
        getLogger().error('Expected "aws.downloadPath" to be string, got %O', typeof lastUsedPath)
    }
    return downloadsDir()
}

export async function setDefaultDownloadPath(downloadPath: string) {
    try {
        if (await fs.existsDir(downloadPath)) {
            await globals.globalState.update('aws.downloadPath', downloadPath)
        } else {
            await globals.globalState.update('aws.downloadPath', path.dirname(downloadPath))
        }
    } catch (err) {
        getLogger().error('Error while setting "aws.downloadPath": %O', err as Error)
    }
}

const FileSystemStabilityExceptionId = 'FileSystemStabilityException'
const FileSystemStabilityException = ToolkitError.named(FileSystemStabilityExceptionId)

/**
 * Run this function to validate common file system calls/flows, ensuring they work
 * as expected.
 *
 * The intent of this function is to catch potential fs issues early,
 * testing common cases of fs usage. We need this since each machine can behave
 * differently depending on things like OS, permissions, disk speed, ...
 *
 * @throws a {@link FileSystemStabilityException} which wraps the underlying failed fs operation error.
 */
export async function throwOnUnstableFileSystem(tmpRoot: string = tempDirPath) {
    const tmpFolder = path.join(tmpRoot, `validateStableFS-${crypto.randomBytes(4).toString('hex')}`)
    const tmpFile = path.join(tmpFolder, 'file.txt')

    try {
        // test basic folder operations
        await withFailCtx('mkdirInitial', () => fs.mkdir(tmpFolder))
        // Verifies that we do not throw if the dir exists and we try to make it again
        await withFailCtx('mkdirButAlreadyExists', () => fs.mkdir(tmpFolder))
        // Test subfolder creation. Based on telemetry it looks like the vsc mkdir may be flaky
        // when creating subfolders. Hopefully this gives us some useful information.
        const subfolderRoot = path.join(tmpFolder, 'a')
        const subfolderPath = path.join(subfolderRoot, 'b/c/d/e')
        await withFailCtx('mkdirSubfolderNode', () => nodeFs.mkdir(subfolderPath, { recursive: true }))
        await withFailCtx('rmdirInitialForNode', () => fs.delete(subfolderRoot, { recursive: true }))
        await withFailCtx('mkdirSubfolderVsc', () => fs.mkdir(subfolderPath))
        await withFailCtx('rmdirInitialForVsc', () => fs.delete(subfolderRoot, { recursive: true }))

        // test basic file operations
        await withFailCtx('mkdirForFileOpsTest', () => fs.mkdir(tmpFolder))
        await withFailCtx('writeFile1', () => fs.writeFile(tmpFile, 'test1'))
        await withFailCtx('readFile1', async () => {
            const text = await fs.readFileText(tmpFile)
            if (text !== 'test1') {
                throw new Error(`Unexpected file contents: "${text}"`)
            }
        })
        // overwrite the file content multiple times
        await withFailCtx('writeFile2', () => fs.writeFile(tmpFile, 'test2'))
        await withFailCtx('writeFile3', () => fs.writeFile(tmpFile, 'test3'))
        await withFailCtx('writeFile4', () => fs.writeFile(tmpFile, 'test4'))
        await withFailCtx('writeFile5', () => fs.writeFile(tmpFile, 'test5'))
        await withFailCtx('readFile5', async () => {
            const text = await fs.readFileText(tmpFile)
            if (text !== 'test5') {
                throw new Error(`Unexpected file contents after multiple writes: "${text}"`)
            }
        })
        // write a large file, ensuring we are not near a space limit
        await withFailCtx('writeFileLarge', () => fs.writeFile(tmpFile, 'a'.repeat(1000)))
        // test concurrent reads on a file
        await withFailCtx('writeFileConcurrencyTest', () => fs.writeFile(tmpFile, 'concurrencyTest'))
        const result = await Promise.all([
            withFailCtx('readFileConcurrent1', () => fs.readFileText(tmpFile)),
            withFailCtx('readFileConcurrent2', () => fs.readFileText(tmpFile)),
            withFailCtx('readFileConcurrent3', () => fs.readFileText(tmpFile)),
            withFailCtx('readFileConcurrent4', () => fs.readFileText(tmpFile)),
            withFailCtx('readFileConcurrent5', () => fs.readFileText(tmpFile)),
        ])
        if (result.some((text) => text !== 'concurrencyTest')) {
            throw new Error(`Unexpected concurrent file reads: ${result}`)
        }
        // test deleting a file
        await withFailCtx('deleteFileInitial', () => fs.delete(tmpFile))
        await withFailCtx('writeFileAfterDelete', () => fs.writeFile(tmpFile, 'afterDelete'))
        await withFailCtx('readNewFileAfterDelete', async () => {
            const text = await fs.readFileText(tmpFile)
            if (text !== 'afterDelete') {
                throw new Error(`Unexpected file content after writing to deleted file: "${text}"`)
            }
        })
        await withFailCtx('deleteFileFully', () => fs.delete(tmpFile))
        await withFailCtx('notExistsFileAfterDelete', async () => {
            const res = await fs.exists(tmpFile)
            if (res) {
                throw new Error(`Expected file to NOT exist: "${tmpFile}"`)
            }
        })

        // test rename
        await withFailCtx('writeFileForRename', () => fs.writeFile(tmpFile, 'TestingRename'))
        const tmpFileRenamed = tmpFile + '.renamed'
        await withFailCtx('renameFile', () => fs.rename(tmpFile, tmpFileRenamed))
        await withFailCtx('existsRenamedFile', async () => {
            const res = await fs.exists(tmpFileRenamed)
            if (!res) {
                throw new Error(`Expected RENAMED file to exist: "${tmpFileRenamed}"`)
            }
        })
        await withFailCtx('writeToRenamedFile', async () => fs.writeFile(tmpFileRenamed, 'hello'))
        await withFailCtx('readFromRenamedFile', async () => {
            const res = await fs.readFileText(tmpFileRenamed)
            if (res !== 'hello') {
                throw new Error(`Expected RENAMED file to be writable: "${tmpFileRenamed}"`)
            }
        })
        await withFailCtx('renameFileReset', () => fs.rename(tmpFileRenamed, tmpFile))
        await withFailCtx('renameFileResetExists', async () => {
            const res = await fs.exists(tmpFile)
            if (!res) {
                throw new Error(`Expected reverted renamed file to exist: "${tmpFile}"`)
            }
        })
    } finally {
        await fs.delete(tmpFolder, { recursive: true, force: true })
    }

    async function withFailCtx<T>(ctx: string, fn: () => Promise<T>): Promise<T> {
        try {
            return await fn()
        } catch (e) {
            if (!(e instanceof Error)) {
                throw e
            }
            throw FileSystemStabilityException.chain(e, `context: "${ctx}"`, { code: FileSystemStabilityExceptionId })
        }
    }
}
