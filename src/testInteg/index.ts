/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { runTests } from '../test/testRunner'

export function run(): Promise<void> {
    return runTests('src/testInteg', ['src/testInteg/globalSetup.test.ts'])
}
