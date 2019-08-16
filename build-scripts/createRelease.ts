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

const timestamp = new Date().toISOString().split('T')[0]
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

// tslint:disable-next-line: no-unsafe-any
changelog.entries.sort((x: { type: string }, y: { type: string }) => x.type.localeCompare(y.type))

// Write changelog file
fs.writeFileSync(changesFile, JSON.stringify(changelog, undefined, '\t'))
const fileData = fs.readFileSync('CHANGELOG.md')
let append = `## ${releaseVersion} ${timestamp}\n\n`
// tslint:disable-next-line: no-unsafe-any
for (const file of changelog.entries) {
    // tslint:disable-next-line: no-unsafe-any
    append += `- **${file.type}** ${file.description}\n`
}

append += '\n' + fileData.toString()
fs.writeFileSync('CHANGELOG.md', append)

child_process.execSync(`git add ${changesDirectory}`)
child_process.execSync(`git rm -rf ${nextReleaseDirectory}`)
child_process.execSync('git add CHANGELOG.md')

console.log(changesFile)
