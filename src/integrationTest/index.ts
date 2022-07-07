/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { runTests } from '../test/testRunner'

export function run(): Promise<void> {
    return runTests('src/integrationTest', ['src/integrationTest/globalSetup.test.ts'])
}
