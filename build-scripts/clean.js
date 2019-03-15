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

(async () => {
    for (const arg of process.argv.slice(1)) {
        const directory = path.join(__dirname, '..', arg)

        try {
            fs.accessSync(directory)
        } catch (e) {
            console.log(`Could not access '${directory}'. Skipping clean.`)
            return
        }

        console.log(`Removing ${directory} ...`)

        await del(
            directory,
            {
                force: true,
            }
        )

        console.log('Done')
    }
})()
