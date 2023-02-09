/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Creates an artifact that can be given to users for testing alpha/beta builds:
//
//     aws-toolkit-vscode-1.999.0-xxxxxxxxxxxx.vsix
//
// Where `xxxxxxxxxxxx` is the first 12 characters of the commit hash that produced the artifact
//
// The script works like this:
// 1. temporarily change `version` in package.json
// 2. invoke `vsce package`
// 3. restore the original package.json
//

import type * as manifest from '../../package.json'
import * as child_process from 'child_process'
import * as fs from 'fs-extra'

// Importing from `src` isn't great but it does make things simple
import { betaUrl } from '../../src/dev/config'

const packageJsonFile = './package.json'
const webpackConfigJsFile = './webpack.config.js'

function parseArgs() {
    // Invoking this script with argument "foo":
    //   $ npm run package -- foo
    // yields this argv:
    //   0: /…/node_modules/.bin/ts-node
    //   1: /…/src/scripts/build/package.ts
    //   2: foo

    const givenArgs = process.argv.slice(2)
    const validOptions = ['--debug', '--no-clean']

    for (const a of givenArgs) {
        if (!validOptions.includes(a)) {
            throw Error(`invalid argument: ${a}`)
        }
    }

    return {
        /** Produce an unoptimized VSIX. Include git SHA in version string. */
        debug: givenArgs.includes('--debug'),
        /** Skips `npm run clean` when building the VSIX. This prevents file watching from breaking. */
        skipClean: givenArgs.includes('--no-clean'),
    }
}

/**
 * If the current commit is tagged then it is a "release build", else it is
 * a prerelease/nightly/edge/preview build.
 */
function isRelease(): boolean {
    return child_process.execSync('git tag -l --contains HEAD').toString() !== ''
}

/**
 * Whether or not this a private beta build
 */
function isBeta(): boolean {
    return !!betaUrl
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

        if (release && isBeta()) {
            throw new Error('Cannot package VSIX as both a release and a beta simultaneously')
        }

        if (!release || args.debug) {
            // Create backup files so we can restore the originals later.
            fs.copyFileSync(packageJsonFile, `${packageJsonFile}.bk`)
            fs.copyFileSync(webpackConfigJsFile, `${webpackConfigJsFile}.bk`)

            const packageJson: typeof manifest = JSON.parse(fs.readFileSync(packageJsonFile, { encoding: 'utf-8' }))
            const versionSuffix = getVersionSuffix()
            const version = packageJson.version
            // Setting the version to an arbitrarily high number stops VSC from auto-updating the beta extension
            const betaOrDebugVersion = `1.999.0${versionSuffix}`
            if (isBeta() || args.debug) {
                packageJson.version = betaOrDebugVersion
            } else {
                packageJson.version = version.replace('-SNAPSHOT', versionSuffix)
            }

            if (args.skipClean) {
                // Clearly we need `prepublish` to be a standalone script and not a bunch of `npm` commands
                const prepublish = packageJson.scripts['vscode:prepublish']
                const replaced = prepublish.replace('npm run clean', 'echo "Skipped clean"')
                packageJson.scripts['vscode:prepublish'] = replaced
            }

            fs.writeFileSync(packageJsonFile, JSON.stringify(packageJson, undefined, '    '))

            if (args.debug) {
                const webpackConfigJs = fs.readFileSync(webpackConfigJsFile, { encoding: 'utf-8' })
                fs.writeFileSync(webpackConfigJsFile, webpackConfigJs.replace(/minimize: true/, 'minimize: false'))
            }
        }

        child_process.execSync(`vsce package`, { stdio: 'inherit' })
        const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, { encoding: 'utf-8' }))
        console.log(`VSIX Version: ${packageJson.version}`)
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
