/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

function parseArgs() {
    // Invoking this script with argument "foo":
    //   $ npm run package -- foo
    // yields this argv:
    //   0: /…/node_modules/.bin/ts-node
    //   1: /…/build-scripts/package.ts
    //   2: foo

    const args = {
        debug: false,
    }

    if (process.argv[2] === '--debug') {
        args.debug = true
    } else if (process.argv[2]) {
        throw Error(`invalid argument: ${process.argv[2]}`)
    }

    return args
}

/**
 * If the current commit is tagged then it is a "release build", else it is
 * a prerelease/nightly/edge/preview build.
 */
function isRelease(): boolean {
    return child_process.execSync('git tag -l --contains HEAD').toString() !== ''
}

/**
 * Gets a suffix to append to the version-string, or empty for release builds.
 *
 * TODO: use `git describe` instead.
 *
 * @returns version-string suffix, for example: "-e6ecd84685a9"
 */
function getVersionSuffix(): string {
    if (isRelease()) {
        return ''
    }
    const commitId = child_process.execSync('git rev-parse --short=12 HEAD').toString().trim()
    if (!commitId) {
        return ''
    }
    return `-${commitId}`
}

function main() {
    const args = parseArgs()
    let release = true

    try {
        release = isRelease()

        if (!release || args.debug) {
            // Create backup files so we can restore the originals later.
            fs.copyFileSync(packageJsonFile, `${packageJsonFile}.bk`)
            fs.copyFileSync(webpackConfigJsFile, `${webpackConfigJsFile}.bk`)

            const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, { encoding: 'UTF-8' }).toString())
            const versionSuffix = getVersionSuffix()
            const version: string = packageJson.version?.toString()
            packageJson.version = args.debug ? `1.99.0${versionSuffix}` : version.replace('-SNAPSHOT', versionSuffix)
            fs.writeFileSync(packageJsonFile, JSON.stringify(packageJson, undefined, '    '))

            if (args.debug) {
                const webpackConfigJs = fs.readFileSync(webpackConfigJsFile, { encoding: 'UTF-8' }).toString()
                fs.writeFileSync(webpackConfigJsFile, webpackConfigJs.replace(/minimize: true/, 'minimize: false'))
            }
        }

        child_process.execSync(`vsce package`)
    } catch (e) {
        console.log(e)
        throw Error('package.ts: failed')
    } finally {
        if (!release) {
            // Restore the original files.
            fs.copyFileSync(`${packageJsonFile}.bk`, packageJsonFile)
            fs.copyFileSync(`${webpackConfigJsFile}.bk`, webpackConfigJsFile)
            fs.unlinkSync(`${packageJsonFile}.bk`)
            fs.unlinkSync(`${webpackConfigJsFile}.bk`)
        }
    }
}

main()
