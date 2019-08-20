/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

/*
 * This script removes the specified folders.
 * Used to perform a clean compile, which is useful for things like:
 *   - flushing out stale test files.
 *   - updating dependencies after changing branches
 */

const fs = require('fs')
const _path = require('path')
const util = require('util')

const readdir = util.promisify(fs.readdir)
const rmdir = util.promisify(fs.rmdir)
const stat = util.promisify(fs.stat)
const unlink = util.promisify(fs.unlink)

// Recursive delete without requiring a third-party library. This allows the script
// to be run before `npm install`.
async function rdelete(path) {
    const stats = await stat(path)
    if (stats.isFile()) {
        await unlink(path)
    } else if (stats.isDirectory()) {
        const promises = (await readdir(path)).map(child => rdelete(_path.join(path, child)))

        await Promise.all(promises)
        await rmdir(path)
    } else {
        throw new Error(`Could not delete '${path}' because it is neither a file nor directory`)
    }
}

;(async () => {
    for (const arg of process.argv.slice(2)) {
        try {
            const directory = _path.join(__dirname, '..', arg)

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
