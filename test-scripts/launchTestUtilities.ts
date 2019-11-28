/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as glob from 'glob'
import { runTests } from 'vscode-test'

export interface LaunchTestParameters {
    extensionDevelopmentPath: string
    extensionTestsPath: string
    workspacePath?: string
}

/**
 * Utility method to launch Extension tests that require the VS Code Extension Development Host in order to run.
 */
export async function launchVsCodeTest(parameters: LaunchTestParameters) {
    try {
        console.log('Running Tests...')
        console.log(`extensionDevelopmentPath: ${parameters.extensionDevelopmentPath}`)
        console.log(`extensionTestsPath: ${parameters.extensionTestsPath}`)
        console.log(`workspacePath: ${parameters.workspacePath}`)

        let launchArgs: string[] | undefined

        if (parameters.workspacePath) {
            launchArgs = [parameters.workspacePath]
        }

        // Download VS Code, unzip it and run the integration test
        await runTests({
            extensionDevelopmentPath: parameters.extensionDevelopmentPath,
            extensionTestsPath: parameters.extensionTestsPath,
            vscodeExecutablePath: await findVsCodeTestExecutable(),
            launchArgs: launchArgs
        })

        console.log('Finished running tests!')
    } catch (err) {
        console.error('Failed to run tests')
        process.exit(1)
    }
}

/**
 * Convenience for offline usage when the test exe has already been downloaded
 */
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
