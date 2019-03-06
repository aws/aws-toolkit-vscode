/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

/*
 * This script removes the out folder. 
 * Used to perform a clean compile, which is useful for things like flushing out stale test files.
 */

const del = require('del')
const fs = require('fs')
const path = require('path')

function exists(path) {
    try {
        fs.accessSync(path)
        return true
    } catch {
        return false
    }
}

function getOutDir() {
    return path.join(__dirname, '..', 'out')
}

(async () => {

    const outDir = getOutDir()

    if (!exists(outDir)) {
        console.log(`${outDir} does not exist. Skipping clean.`)
        return
    }

    console.log(`Removing ${outDir} ...`)

    await del(
        outDir,
        {
            force: true,
        }
    )

    console.log('Done')
})()
