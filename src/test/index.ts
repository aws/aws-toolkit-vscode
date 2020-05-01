/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { run as runTest } from './testRunner'

export function run(): Promise<void> {
    return runTest('unit')
}
