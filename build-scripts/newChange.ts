/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import * as fs from 'fs-extra'
import { join } from 'path'
// tslint:disable-next-line:no-implicit-dependencies
import readlineSync = require('readline-sync')
import { v4 as uuid } from 'uuid'

const directory = '.changes/next-release'

enum ChangeType {
    Test = 'test',
    BreakingChange = 'Breaking Change',
    Feature = 'Feature',
    Bugfix = 'Bug Fix',
    Deprecation = 'Deprecation',
    Removal = 'Removal'
}

interface NewChange {
    type: string,
    description: string
}

function promptForType(): string {
    const message = `
    Please enter the type of change:
    0. Test
    1. Breaking Change
    2. Feature
    3. Bug Fix
    4. Deprecation
    5. Removal
    `

    let changeType = ''
    do {
        const response = +readlineSync.question(message)
        switch (response) {
            case 0:
                changeType = ChangeType.Test
                break
            case 1:
                changeType = ChangeType.BreakingChange
                break
            case 2:
                changeType = ChangeType.Feature
                break
            case 3:
                changeType = ChangeType.Bugfix
                break
            case 4:
                changeType = ChangeType.Deprecation
                break
            case 5:
                changeType = ChangeType.Removal
                break
            default:
                console.log('Invalid change type, change type must be between 0 and 5')
                break
        }

    } while (changeType === '')

    return changeType
}

function promptForChange(): string {
    return readlineSync.question('Change message: ')
}

fs.mkdirpSync(directory)

const type = promptForType()
const description = promptForChange()
const contents: NewChange = {
    type: type,
    description: description
}
const fileName = `${type}-${uuid()}.json`
const path = join(directory, fileName)
fs.writeFileSync(path, JSON.stringify(contents, undefined, '\t'))

console.log(`Change log written to ${path}`)
child_process.execSync(`git add ${directory}`)
console.log('Change log added to git working directory')
