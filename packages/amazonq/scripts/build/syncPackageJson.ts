/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * We are currently in the process of splitting the toolkit into a core library and separate extensions.
 * A lot of the core toolkit code depends on contents of its package.json. However, in order for
 * individual extensions to function, they need to have the same entries in their local package.jsons as well.
 *
 * Unlike the Toolkit extension, the Amazon Q extension only needs to copy its settings from the core.
 * Settings type checking is performed at compile time in core/src/shared/settings.ts, so it needs to
 * exist in the core package.json as well.
 *
 * TODO: Drop settings initialization into respective extensions.
 */

import * as fs from 'fs-extra'

function main() {
    const packageJsonFile = './package.json'
    const coreLibPackageJsonFile = '../core/package.json'

    const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, { encoding: 'utf-8' }))
    const coreLibPackageJson = JSON.parse(fs.readFileSync(coreLibPackageJsonFile, { encoding: 'utf-8' }))

    const coreSettings = coreLibPackageJson.contributes.configuration.properties
    Object.keys(coreSettings).forEach(key => {
        if (key.startsWith('amazonQ')) {
            packageJson.contributes.configuration.properties[key] = coreSettings[key]
        }
    })

    fs.writeFileSync(packageJsonFile, JSON.stringify(packageJson, undefined, '    ') + '\n')
}

main()
