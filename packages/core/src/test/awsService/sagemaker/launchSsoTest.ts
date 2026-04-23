/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron'
import * as path from 'path'

async function main() {
    const vscodeExecutablePath = await downloadAndUnzipVSCode('1.85.0')
    const extensionDevelopmentPath = path.resolve(__dirname, '../../')
    const extensionTestsPath = path.resolve(__dirname, './runSsoTest')

    const result = await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: ['--disable-extensions', '--disable-workspace-trust'],
    })

    process.exit(result)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
