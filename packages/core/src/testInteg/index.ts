/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { runTests } from '../test/testRunner'

export function run(): Promise<void> {
    return runTests(process.env.TEST_DIR ?? 'src/testInteg', ['src/testInteg/globalSetup.test.ts'])
}

export * from './integrationTestsUtilities'
