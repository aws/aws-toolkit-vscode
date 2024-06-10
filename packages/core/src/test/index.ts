/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { runTests } from './testRunner'

export function run(): Promise<void> {
    return runTests(process.env.TEST_DIR ?? 'src/test', ['src/test/globalSetup.test.ts'])
}

export { registerAuthHook, using } from './setupUtil'
export { runTests } from './testRunner'
export * from './codewhisperer/testUtil'
export * from './testUtil'
