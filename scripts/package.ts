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

import * as child_process from 'child_process'
import * as fs from 'fs-extra'
import * as path from 'path'

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
    try {
        // This path only exists for packages/toolkit.
        // As noted before: "Importing from `src` isn't great but it does make things simple"
        // TODO: Generalize betaUrl for all packages.
        const betaUrl = require(path.resolve('./src/dev/config')).betaUrl
        return !!betaUrl
    } catch {
        return false
    }
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
    // It is expected that this will package from a packages/{subproject} folder.
    // There is a base config in packages/
    const packageJsonFile = './package.json'
    const backupJsonFile = `${packageJsonFile}.package.bk`
    const webpackConfigJsFile = '../webpack.base.config.js'
    const backupWebpackConfigFile = `${webpackConfigJsFile}.package.bk`

    if (!fs.existsSync(packageJsonFile)) {
        throw new Error(`package.json not found, cannot package this directory: ${process.cwd()}`)
    }

    let release = true

    try {
        release = isRelease()

        if (release && isBeta()) {
            throw new Error('Cannot package VSIX as both a release and a beta simultaneously')
        }
        // Create backup file so we can restore the originals later.
        fs.copyFileSync(packageJsonFile, backupJsonFile)
        const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, { encoding: 'utf-8' }))

        if (!release || args.debug) {
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

            if (args.debug) {
                fs.copyFileSync(webpackConfigJsFile, backupWebpackConfigFile)
                const webpackConfigJs = fs.readFileSync(webpackConfigJsFile, { encoding: 'utf-8' })
                fs.writeFileSync(webpackConfigJsFile, webpackConfigJs.replace(/minimize: true/, 'minimize: false'))
            }
        }
        // Always include CHANGELOG.md until we can have separate changelogs for packages
        fs.copyFileSync('../../CHANGELOG.md', 'CHANGELOG.md')

        fs.writeFileSync(packageJsonFile, JSON.stringify(packageJson, undefined, '    '))
        child_process.execSync(`vsce package --ignoreFile '../.vscodeignore.packages'`, { stdio: 'inherit' })

        console.log(`VSIX Version: ${packageJson.version}`)

        // Hoist .vsix to root folder, because the release infra expects it to be there.
        // TODO: Once we can support releasing multiple artifacts,
        // let's just keep the .vsix in its respective project folder in packages/
        const vsixName = `${packageJson.name}-${packageJson.version}.vsix`
        fs.moveSync(vsixName, `../../${vsixName}`, { overwrite: true })
    } catch (e) {
        console.log(e)
        throw Error('package.ts: failed')
    } finally {
        // Restore the original files.
        fs.copyFileSync(backupJsonFile, packageJsonFile)
        fs.unlinkSync(backupJsonFile)
        if (args.debug) {
            fs.copyFileSync(backupWebpackConfigFile, webpackConfigJsFile)
            fs.unlinkSync(backupWebpackConfigFile)
        }
    }
}

main()
