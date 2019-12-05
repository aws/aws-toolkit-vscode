/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as legacyTestRunner from '../../third-party/test/index'

export interface RunTestsParameters {
    rootTestsPath: string
}

export async function runTests(parameters: RunTestsParameters): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        legacyTestRunner.runTests(parameters.rootTestsPath, (err: any, failureCount: number) => {
            if (err) {
                reject(err)
            }

            if (failureCount > 0) {
                console.log(`Tests completed with ${failureCount} failure(s)`)
                reject(new Error(`Failed Tests: ${failureCount}`))
            } else {
                console.log('Tests completed with success')
                resolve()
            }
        })
    })
}
