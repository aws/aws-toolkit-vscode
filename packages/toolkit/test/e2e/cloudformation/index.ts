/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { runTests } from 'aws-core-vscode/test'
import { VSCODE_EXTENSION_ID_CONSTANTS } from 'aws-core-vscode/utils'

export function run(): Promise<void> {
    return runTests(
        process.env.TEST_DIR ?? ['../../core/dist/src/testE2E/cloudformation'],
        VSCODE_EXTENSION_ID_CONSTANTS.awstoolkit,
        ['../../core/dist/src/testInteg/globalSetup.test.ts']
    )
}
