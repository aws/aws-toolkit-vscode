/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import * as fs from 'fs-extra'
import * as path from 'path'

const changesDirectory = '.changes'
const nextReleaseDirectory = path.join(changesDirectory, 'next-release')
// tslint:disable-next-line:no-var-requires no-unsafe-any
const releaseVersion = require(path.join('..', 'package.json')).version
const changesFile = path.join(changesDirectory, `${releaseVersion}.json`)

fs.mkdirpSync(nextReleaseDirectory)

const changeFiles = fs.readdirSync(nextReleaseDirectory)
if (changeFiles.length === 0) {
    console.log('Error! no changes to release!')
    process.exit(-1)
}
try {
    fs.accessSync(changesFile)
    console.log(`Error! changelog file ${changesFile} already exists for version ${releaseVersion}!`)
    process.exit(-1)
} catch (err) {
    // This is what we want to happen, the file should not exist
}

const now = new Date()
const timestamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDay()}`
const changelog: any = {
    date: timestamp,
    version: releaseVersion,
    entries: []
}

for (const changeFile of changeFiles) {
    const file = JSON.parse(fs.readFileSync(path.join(nextReleaseDirectory, changeFile)).toString())
    // tslint:disable-next-line: no-unsafe-any
    changelog.entries.push(file)
}

// Write changelog file
fs.writeFileSync(changesFile, JSON.stringify(changelog, undefined, '\t'))
const changelogFile = fs.openSync('CHANGELOG.md', 'a+')
const append = Buffer.from(`## ${releaseVersion} ${timestamp}\n\n`, 'utf8')
for (const changeFile of changeFiles) {
    const file: any = JSON.parse(fs.readFileSync(path.join(nextReleaseDirectory, changeFile)).toString())
    // tslint:disable-next-line: no-unsafe-any
    Buffer.concat([append, Buffer.from(`- **${file.type}** ${file.description}\n`, 'utf8')])
}

Buffer.concat([append, Buffer.from('\n', 'utf8')])
fs.writeSync(changelogFile, append, 0, append.length, 0)

child_process.execSync(`git add ${changesDirectory}`)
child_process.execSync(`git rm -rf ${nextReleaseDirectory}`)
child_process.execSync('git add CHANGELOG.md')

console.log(changesFile)
