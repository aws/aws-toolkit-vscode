/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolve } from 'path'
import { runToolkitTests } from './launchTestUtilities'
void (async () => {
    await runToolkitTests('e2e', resolve('dist', 'src', 'testE2E', 'index.js'))
})()
