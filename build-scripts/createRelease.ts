/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as path from 'path'

const changesDirectory = '.changes'
const nextReleaseDirectory = path.join(changesDirectory, 'next-release')
// tslint:disable-next-line:no-var-requires no-unsafe-any
const releaseVersion = require(path.join('..', 'package.json')).version
const changesFile = path.join(changesDirectory, `${releaseVersion}.json`)

fs.mkdirpSync(nextReleaseDirectory)

const changes = fs.readdirSync(nextReleaseDirectory)
if (changes.length === 0) {
    console.log('Error! no changes to release!')
    process.exit(-1)
}
try {
    fs.accessSync(changesFile)
    console.log(`Error! changelog file ${changesFile} already exists for version ${releaseVersion}!`)
    process.exit(-1)
} catch (err) {
    // This is what we want to happen the files should not exist
}

console.log(changesFile)
