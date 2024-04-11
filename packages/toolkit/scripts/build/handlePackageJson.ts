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
 */

import * as fs from 'fs-extra'

function main() {
    const packageJsonFile = './package.json'
    const backupJsonFile = `${packageJsonFile}.handlePackageJson.bk`
    const coreLibPackageJsonFile = '../core/package.json'
    let restoreMode = false

    const args = process.argv.slice(2)
    if (args.includes('--restore')) {
        restoreMode = true
    }

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
            if (key.startsWith('aws.amazonQ') || key.startsWith('aws.codeWhisperer')) {
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

main()
