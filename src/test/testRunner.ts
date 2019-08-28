/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:no-implicit-dependencies
import * as glob from 'glob'
import * as Mocha from 'mocha'
// tslint:enable:no-implicit-dependencies

import * as path from 'path'

export interface RunTestsParameters {
    /**
     * The root folder containing all tests to be run
     */
    rootTestsPath: string
}

/**
 * Utility method to invoke tests. Abstracts away the test framework (currently mocha)
 */
export async function runTests(parameters: RunTestsParameters): Promise<void> {
    console.log(`Searching for tests in: ${parameters.rootTestsPath}`)
    const testFiles = await findTestFiles(parameters.rootTestsPath)
    console.log(`Found ${testFiles.length} file(s) to test. Running...`)

    return new Promise<void>((resolve, reject) => {
        const mocha = new Mocha({
            ui: 'bdd'
        })
        mocha.useColors(true)

        // Add files to the test suite
        testFiles.forEach(testFile => mocha.addFile(path.resolve(parameters.rootTestsPath, testFile)))

        try {
            // Run the mocha test
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`))
                } else {
                    resolve()
                }
            })
        } catch (err) {
            reject(err)
        }
    })
}

async function findTestFiles(rootPath: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        glob('**/**.test.js', { cwd: rootPath }, (err: any, files: string[]) => {
            if (err) {
                reject(err)
            }

            resolve(files)
        })
    })
}
