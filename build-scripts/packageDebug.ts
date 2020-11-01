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
const webpackConfigJsFile = './webpack.config.js'

try {
    // Create backup files so we can restore the originals later.
    fs.copyFileSync(packageJsonFile, `${packageJsonFile}.bk`)
    fs.copyFileSync(webpackConfigJsFile, `${webpackConfigJsFile}.bk`)

    const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, { encoding: 'UTF-8' }).toString())
    packageJson.version = '1.99.0-SNAPSHOT'
    fs.writeFileSync(packageJsonFile, JSON.stringify(packageJson, undefined, '    '))

    const webpackConfigJs = fs.readFileSync(webpackConfigJsFile, { encoding: 'UTF-8' }).toString()
    fs.writeFileSync(webpackConfigJsFile, webpackConfigJs.replace(/minimize: true/, 'minimize: false'))

    child_process.execSync(`vsce package`)
} catch (e) {
    console.log(e)
    throw Error('packageDebug.ts: failed')
} finally {
    // Restore the original files.
    fs.copyFileSync(`${packageJsonFile}.bk`, packageJsonFile)
    fs.copyFileSync(`${webpackConfigJsFile}.bk`, webpackConfigJsFile)
    fs.unlinkSync(`${packageJsonFile}.bk`)
    fs.unlinkSync(`${webpackConfigJsFile}.bk`)
}
