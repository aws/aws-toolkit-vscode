/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { runTests } from 'aws-core-vscode/test'
import { VSCODE_EXTENSION_ID } from 'aws-core-vscode/utils'

export function run(): Promise<void> {
    return runTests(process.env.TEST_DIR ?? ['test/unit'], VSCODE_EXTENSION_ID.amazonq, [
        '../../core/dist/src/test/globalSetup.test.ts',
    ])
}
