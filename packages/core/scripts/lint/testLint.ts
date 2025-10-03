/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { glob } from 'glob'
import Mocha from 'mocha'
void (async () => {
    try {
        console.log('Running linting tests...')

        const mocha = new Mocha({
            timeout: 5000,
        })

        const testFiles = await glob('dist/src/testLint/**/*.test.js')
        for (const file of testFiles) {
            mocha.addFile(file)
        }

        mocha.run((failures) => {
            const exitCode = failures ? 1 : 0
            console.log(`Finished running Main test suite with result code: ${exitCode}`)
            process.exit(exitCode)
        })
    } catch (err) {
        console.error(err)
        console.error('Failed to run tests')
        process.exit(1)
    }
})()
