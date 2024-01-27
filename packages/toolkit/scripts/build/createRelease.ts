/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Generates CHANGELOG.md
//

import * as child_process from 'child_process'
import * as fs from 'fs-extra'
import * as path from 'path'
import { version } from '../../package.json'

const cwd = process.cwd()
const changesDirectory = path.join(cwd, '../../.changes')
const nextReleaseDirectory = path.join(changesDirectory, 'next-release')
const changesFile = path.join(changesDirectory, `${version}.json`)

fs.mkdirpSync(nextReleaseDirectory)

const changeFiles = fs.readdirSync(nextReleaseDirectory)
if (changeFiles.length === 0) {
    console.warn('no changes to release (missing .changes/ directory)')
    process.exit()
}
try {
    fs.accessSync(changesFile)
    console.log(`error: changelog data file already exists: ${changesFile}`)
    process.exit(-1)
} catch (err) {
    // This is what we want to happen, the file should not exist
}

const timestamp = new Date().toISOString().split('T')[0]
const changelog: any = {
    date: timestamp,
    version: version,
    entries: [],
}

for (const changeFile of changeFiles) {
    const file = JSON.parse(fs.readFileSync(path.join(nextReleaseDirectory, changeFile)).toString())
    changelog.entries.push(file)
}

changelog.entries.sort((x: { type: string }, y: { type: string }) => x.type.localeCompare(y.type))

// Write changelog file
fs.writeFileSync(changesFile, JSON.stringify(changelog, undefined, '\t'))
const fileData = fs.readFileSync(path.join(cwd, 'CHANGELOG.md'))
let append = `## ${version} ${timestamp}\n\n`
for (const file of changelog.entries) {
    append += `- **${file.type}** ${file.description}\n`
}

append += '\n' + fileData.toString()
fs.writeFileSync('CHANGELOG.md', append)

child_process.execSync(`git add ${changesDirectory}`)
child_process.execSync(`git rm -rf ${nextReleaseDirectory}`)
child_process.execSync('git add CHANGELOG.md')

console.log(changesFile)
