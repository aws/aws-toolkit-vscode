/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

;(async () => {
    for (const arg of process.argv.slice(2)) {
        try {
            const directory = path.join(process.cwd(), arg)

            try {
                fs.accessSync(directory)
            } catch (e) {
                console.log(
                    `Could not access '${directory}', probably because it does not exist. Skipping clean for this directory.`
                )
                return
            }

            console.log(`Removing ${directory} ...`)

            await rdelete(directory)

            console.log('Done')
        } catch (e) {
            console.error(`Could not clean '${arg}': ${String(e)}`)
        }
    }
})()
