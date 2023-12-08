/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Creates an artifact that can be given to users for testing alpha/beta builds:
//
//     aws-toolkit-vscode-99.0.0-xxxxxxx.vsix
//
// Where `xxxxxxx` is the first 7 characters of the commit hash that produced the artifact.
//
// The script works like this:
// 1. temporarily change `version` in package.json
// 2. invoke `vsce package`
// 3. restore the original package.json
//

import type PackageJson from '../../package.json'
import * as child_process from 'child_process'
import * as fs from 'fs-extra'

// Importing from `src` isn't great but it does make things simple
import { betaUrl } from '../../src/dev/config'

const packageJsonFile = './package.json'
const webpackConfigJsFile = './webpack.base.config.js'

function parseArgs() {
    // Invoking this script with argument "foo":
    //   $ npm run package -- foo
    // yields this argv:
    //   0: /…/node_modules/.bin/ts-node
    //   1: /…/src/scripts/build/package.ts
    //   2: foo

    const args: { [key: string]: any } = {
        /** Produce an unoptimized VSIX. Include git SHA in version string. */
        debug: false,
        /** Skips `npm run clean` when building the VSIX. This prevents file watching from breaking. */
        skipClean: false,
        feature: '',
    }

    const givenArgs = process.argv.slice(2)
    const validOptions = ['--debug', '--no-clean', '--feature']
    const expectValue = ['--feature']

    for (let i = 0; i < givenArgs.length; i++) {
        const a = givenArgs[i]
        const argName = a.replace(/^-+/, '') // "--foo" => "foo"
        if (!validOptions.includes(a)) {
            throw Error(`invalid argument: ${a}`)
        }
        if (expectValue.includes(a)) {
            i++
            const val = givenArgs[i]
            if (val === undefined) {
                throw Error(`missing value for arg: ${a}`)
            }
            args[argName] = val
        } else {
            args[argName] = true
        }
    }

    return args
}

/**
 * If the _current_ commit is tagged as a release ("v1.26.0") then it is a "release build", else it
 * is a prerelease/nightly/edge/preview build.
 */
function isRelease(): boolean {
    const tag = child_process.execSync('git tag -l --contains HEAD').toString()
    return !!tag?.match(/v\d+\.\d+\.\d+/)
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
function getVersionSuffix(feature: string, debug: boolean): string {
    if (isRelease()) {
        return ''
    }
    const debugSuffix = debug ? '-debug' : ''
    const featureSuffix = feature === '' ? '' : `-${feature}`
    const commitId = child_process.execSync('git rev-parse --short=7 HEAD').toString().trim()
    const commitSuffix = commitId ? `-${commitId}` : ''
    return `${debugSuffix}${featureSuffix}${commitSuffix}`
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

            const packageJson: typeof PackageJson = JSON.parse(fs.readFileSync(packageJsonFile, { encoding: 'utf-8' }))
            const versionSuffix = getVersionSuffix(args.feature, args.debug)
            const version = packageJson.version
            if (isBeta()) {
                // Declare an arbitrarily high version number, to stop VSC from auto-updating "beta" builds.
                packageJson.version = `99.0.0${versionSuffix}`
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
