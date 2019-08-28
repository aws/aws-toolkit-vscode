/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:no-implicit-dependencies
import * as glob from 'glob'
import { runTests } from 'vscode-test'
// tslint:enable:no-implicit-dependencies

import * as path from 'path'

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../')

        // The path to the extension test script
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, '../out/src/test/index.js')

        console.log('Running Tests...')
        console.log(`extensionDevelopmentPath: ${extensionDevelopmentPath}`)
        console.log(`extensionTestsPath: ${extensionTestsPath}`)

        // Download VS Code, unzip it and run the integration test
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            vscodeExecutablePath: await findVsCodeTestExecutable()
        })

        console.log('Finished running tests!')
    } catch (err) {
        console.error('Failed to run tests')
        process.exit(1)
    }
}

async function findVsCodeTestExecutable(): Promise<string | undefined> {
    return new Promise<string | undefined>((resolve, reject) => {
        const cwd = process.cwd()
        console.log(`Searching for VS Code Test Exe in: ${cwd}`)

        glob('.vscode-test/**/Code.exe', { cwd }, (err, files: string[]) => {
            if (err) {
                console.log(err)
                resolve(undefined)
            }

            if (files.length === 0) {
                console.log('Not found.')
                resolve(undefined)
            }

            console.log(`Found ${files[0]}`)
            resolve(files[0])
        })
    })
}

// tslint:disable-next-line: no-floating-promises
;(async () => {
    await main()
})()
