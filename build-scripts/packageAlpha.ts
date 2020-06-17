/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Creates an artifact that can be given to users for testing alpha builds:
//
//     aws-toolkit-vscode-1.99.0-SNAPSHOT.vsix
//
// The script works like this:
// 1. temporarily change `version` in package.json
// 2. invoke `vsce package`
// 3. restore the original package.json
//

import * as child_process from 'child_process'
import * as fs from 'fs-extra'

const packageJsonFile = './package.json'
// Create a backup so that we can restore the original later.
fs.copyFileSync(packageJsonFile, `${packageJsonFile}.bk`)

const packageJson = JSON.parse(fs.readFileSync('./package.json', { encoding: 'UTF-8' }).toString())
packageJson.version = '1.99.0-SNAPSHOT'

fs.writeFileSync(packageJsonFile, JSON.stringify(packageJson, undefined, '  '))

child_process.execSync(`vsce package`)

// Restore the original package.json.
fs.copyFileSync(`${packageJsonFile}.bk`, packageJsonFile)
