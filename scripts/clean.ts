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
    if (stats.isFile()) {
        await unlink(p)
    } else if (stats.isDirectory()) {
        const promises = (await readdir(p)).map(child => rdelete(path.join(p, child)))

        await Promise.all(promises)
        await rmdir(p)
    } else {
        throw new Error(`Could not delete '${p}' because it is neither a file nor directory`)
    }
}

async function tryDeleteRelative(p: string) {
    try {
        const target = path.resolve(process.cwd(), p)

        if (!exists(target)) {
            console.log(
                `Could not access '${target}', probably because it does not exist. Skipping clean for this path.`
            )
            return
        }

        await rdelete(target)
    } catch (e) {
        console.error(`Could not clean '${p}': ${String(e)}`)
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

async function getGenerated(): Promise<string[]> {
    if (!exists(path.join(process.cwd(), 'dist'))) {
        return []
    }

    const p = path.join(process.cwd(), 'dist', 'generated.buildinfo')

    try {
        const data = JSON.parse(await readFile(p, 'utf-8'))

        if (!Array.isArray(data) || !data.every(d => typeof d === 'string')) {
            throw new Error('File manifest was not an array of strings')
        }

        return data
    } catch (e) {
        console.log(`Failed to read "generated.buildinfo": ${String(e)}`)
        return []
    }
}

void (async () => {
    const args = process.argv.slice(2).concat(await getGenerated())
    await Promise.all(args.map(tryDeleteRelative))
})()
