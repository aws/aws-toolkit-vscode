/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * This script removes the specified folders.
 * Used to perform a clean compile, which is useful for things like:
 *   - flushing out stale test files.
 *   - updating dependencies after changing branches
 */

import * as fs from 'fs'
import * as path from 'path'
import * as util from 'util'

const readFile = util.promisify(fs.readFile)
const readdir = util.promisify(fs.readdir)
const rmdir = util.promisify(fs.rmdir)
const stat = util.promisify(fs.stat)
const unlink = util.promisify(fs.unlink)

// Recursive delete without requiring a third-party library. This allows the script
// to be run before `npm install`.
async function rdelete(p: string) {
    const stats = await stat(p)
    if (!stats.isFile() && !stats.isDirectory()) {
        throw new Error(`Could not delete '${p}' because it is neither a file nor directory`)
    }

    try {
        await unlink(p)
    } catch {
        // Unlink should only fail if it is a non-empty directory that is NOT a symbolic link.
        // stats.isSymoblicLink() does not seem to detect symbolic links to folders?
        const promises = (await readdir(p)).map(child => rdelete(path.join(p, child)))

        await Promise.all(promises)
        await rmdir(p)
    }
}

async function tryDelete(target: string) {
    try {
        if (!exists(target)) {
            console.log(
                `Could not access '${target}', probably because it does not exist. Skipping clean for this path.`
            )
            return
        }

        await rdelete(target)
    } catch (e) {
        console.error(`Could not clean '${target}': ${String(e)}`)
    }
}

function exists(p: string): boolean {
    try {
        fs.accessSync(p)
        return true
    } catch {
        return false
    }
}

function getPathsToDelete(subfolders: string[]): string[] {
    const paths: string[] = []

    for (const subfolder of subfolders) {
        const fullPath = path.join(process.cwd(), subfolder)
        paths.push(...rFileFind(fullPath, 'tsconfig.tsbuildinfo'))
        paths.push(...rDirectoryFind(fullPath, 'dist'))
        paths.push(...rDirectoryFind(fullPath, 'bin'))
    }

    return paths
}

function rFileFind(parentPath: string, fileName: string): string[] {
    if (!fs.existsSync(parentPath) || !fs.lstatSync(parentPath).isDirectory()) {
        return []
    }

    const files: string[] = []

    const childFiles = fs.readdirSync(parentPath)
    for (const childFile of childFiles) {
        const filePath = path.join(parentPath, childFile)
        const fileStat = fs.lstatSync(filePath)

        if (fileStat.isDirectory()) {
            files.push(...rFileFind(filePath, fileName))
        } else if (childFile === fileName) {
            files.push(filePath)
        }
    }

    return files
}

function rDirectoryFind(parentPath: string, directoryName: string): string[] {
    if (!fs.existsSync(parentPath) || !fs.lstatSync(parentPath).isDirectory()) {
        return []
    }

    const directories: string[] = []

    const childFiles = fs.readdirSync(parentPath)
    for (const childFile of childFiles) {
        const fullPath = path.join(parentPath, childFile)
        const fileStat = fs.lstatSync(fullPath)

        if (fileStat.isDirectory()) {
            if (childFile === directoryName) {
                directories.push(fullPath)
            } else {
                directories.push(...rDirectoryFind(fullPath, directoryName))
            }
        }
    }
    return directories
}

;(async () => {
    const subfolders = ['packages']
    const pathsToDelete = getPathsToDelete(subfolders)

    await Promise.all(pathsToDelete.map(tryDelete))
})()
