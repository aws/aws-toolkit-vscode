/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * We are currently in the process of splitting the toolkit into a core library and separate extensions.
 * A lot of the core toolkit code depends on contents of its package.json. However, in order for
 * individual extensions to function, they need to have the same entries in their local package.jsons as well.
 * To avoid having duplicate code, we copy the necessary fields from the core library to the separate toolkit
 * extension when required (e.g. debugging, packaging).
 *
 * TODO: Find a better way to do this, hopefully remove the need for this in the core library.
 *
 * Args:
 *   --restore : reverts the package json changes to the original state
 *   --development: performs actions that should only be done during development and not production
 */

import * as fs from 'fs-extra'

function main() {
    const args = process.argv.slice(2)
    const restoreMode = args.includes('--restore')

    if (args.includes('--development')) {
        /** When we actually package the extension the null extension does not occur, so we will skip this hack */
        fixNullExtensionIssue(restoreMode)
    }

    const packageJsonFile = './package.json'
    const backupJsonFile = `${packageJsonFile}.handlePackageJson.bk`
    const coreLibPackageJsonFile = '../core/package.json'

    if (restoreMode) {
        try {
            fs.copyFileSync(backupJsonFile, packageJsonFile)
            fs.unlinkSync(backupJsonFile)
        } catch (err) {
            console.log(`Could not restore package.json. Error: ${err}`)
        }
    } else {
        fs.copyFileSync(packageJsonFile, backupJsonFile)
        const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, { encoding: 'utf-8' }))
        const coreLibPackageJson = JSON.parse(fs.readFileSync(coreLibPackageJsonFile, { encoding: 'utf-8' }))
        const coreSettings = coreLibPackageJson.contributes.configuration.properties

        // Remove Amazon Q extension settings stored in core
        Object.keys(coreSettings).forEach(key => {
            if (key.startsWith('amazonQ')) {
                delete coreSettings[key]
            }
        })

        packageJson.contributes = {
            ...coreLibPackageJson.contributes,
        }
        packageJson.engines = {
            ...coreLibPackageJson.engines,
        }
        fs.writeFileSync(packageJsonFile, JSON.stringify(packageJson, undefined, '    '))
    }
}

/**
 * HACK:
 *
 * During **Debug mode** the extension is not detected, this breaks things like the VS Code URI handler.
 * A TEMPORARY fix has been narrowed down to setting `engines.vscode` to `*` temporarily in the core package.json.
 * When this field is copied to the toolkit/amazonq package.json by this script, the error stops.
 *
 * Github Issue: https://github.com/aws/aws-toolkit-vscode/issues/4658
 */
function fixNullExtensionIssue(restoreMode: boolean) {
    const corePackageJsonFile = '../core/package.json'
    const backupJsonFile = `${corePackageJsonFile}.core.bk`

    if (restoreMode) {
        try {
            fs.copyFileSync(backupJsonFile, corePackageJsonFile)
            fs.unlinkSync(backupJsonFile)
        } catch (err) {
            console.log(`Could not restore package.json. Error: ${err}`)
        }
    } else {
        fs.copyFileSync(corePackageJsonFile, backupJsonFile)
        const corePackageJson = JSON.parse(fs.readFileSync(corePackageJsonFile, { encoding: 'utf-8' }))

        corePackageJson.engines.vscode = '*'

        fs.writeFileSync(corePackageJsonFile, JSON.stringify(corePackageJson, undefined, '    '))
    }
}

main()
