/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import Mocha from 'mocha'

export async function run(): Promise<void> {
    const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 10000 })
    mocha.addFile(path.resolve(__dirname, '../../globalSetup.test.js'))
    mocha.addFile(path.resolve(__dirname, './ssoCredentialRefresh.test.js'))

    return new Promise((resolve, reject) => {
        mocha.run((failures) => {
            if (failures > 0) {
                reject(new Error(`${failures} test(s) failed.`))
            } else {
                resolve()
            }
        })
    })
}
