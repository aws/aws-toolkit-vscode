/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { glob } from 'glob'
import Mocha from 'mocha'
void (async () => {
    try {
        console.log('Running linting tests...')

        const mocha = new Mocha()

        const testFiles = await glob('packages/toolkit/dist/src/testLint/**/*.test.js')
        testFiles.forEach(file => {
            mocha.addFile(file)
        })

        mocha.run(failures => {
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
