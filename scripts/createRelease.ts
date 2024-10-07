/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Generates CHANGELOG.md
//

import * as child_process from 'child_process'
import * as path from 'path'
import { fs } from '../packages/core/src/shared'
import { readdirSync } from 'fs'

async function main() {
    // Must run from a subproject root folder, e.g packages/toolkit
    const cwd = process.cwd()
    const fileContents = await fs.readFileText('./package.json')
    const packageJson = JSON.parse(fileContents)
    const changesDirectory = path.join(cwd, '.changes')
    const nextReleaseDirectory = path.join(changesDirectory, 'next-release')
    const changesFile = path.join(changesDirectory, `${packageJson.version}.json`)

    await fs.mkdir(nextReleaseDirectory)

    const changeFiles = readdirSync(nextReleaseDirectory)
    if (changeFiles.length === 0) {
        console.warn('no changes to release (missing .changes/ directory)')
        process.exit()
    }
    if (await fs.exists(changesFile)) {
        console.log(`error: changelog data file already exists: ${changesFile}`)
        process.exit(-1)
    }

    const timestamp = new Date().toISOString().split('T')[0]
    const changelog: any = {
        date: timestamp,
        version: packageJson.version,
        entries: [],
    }

    for (const changeFile of changeFiles) {
        const file = JSON.parse(fs.readFileBytes(path.join(nextReleaseDirectory, changeFile)).toString())
        changelog.entries.push(file)
    }

    changelog.entries.sort((x: { type: string }, y: { type: string }) => x.type.localeCompare(y.type))

    // Write changelog file
    await fs.writeFile(changesFile, JSON.stringify(changelog, undefined, '\t'))
    const fileData = fs.readFileBytes(path.join(cwd, 'CHANGELOG.md'))
    let append = `## ${packageJson.version} ${timestamp}\n\n`
    for (const file of changelog.entries) {
        append += `- **${file.type}** ${file.description}\n`
    }

    append += '\n' + fileData.toString()
    await fs.writeFile('CHANGELOG.md', append)

    child_process.execSync(`git add ${changesDirectory}`)
    child_process.execSync(`git rm -rf ${nextReleaseDirectory}`)
    child_process.execSync('git add CHANGELOG.md')

    console.log(changesFile)
}

void main()
