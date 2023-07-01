/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { runTests } from './testRunner'

export function run(): Promise<void> {
    return runTests('src/test', ['src/test/globalSetup.test.ts'])
}
