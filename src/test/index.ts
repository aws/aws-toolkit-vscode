/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:no-implicit-dependencies
import * as glob from 'glob'
import * as Mocha from 'mocha'
// tslint:enable:no-implicit-dependencies

import * as path from 'path'

export async function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'bdd'
    })
    mocha.useColors(true)

    const testsRoot = path.resolve(__dirname, '..')

    return new Promise<void>((resolve, reject) => {
        console.log(`Searching for tests in: ${testsRoot}`)

        glob('test/**/**.test.js', { cwd: testsRoot }, (err, files) => {
            if (err) {
                reject(err)

                return
            }

            // Add files to the test suite
            console.log(`Found ${files.length} file(s). Running...`)
            files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)))

            try {
                // Run the mocha test
                mocha.run(failures => {
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
    })
}
