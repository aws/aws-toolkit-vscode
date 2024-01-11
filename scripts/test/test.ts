/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolve } from 'path'
import { runToolkitTests } from './launchTestUtilities'
void (async () => {
    await runToolkitTests('unit', resolve('dist', 'src', 'test', 'index.js'))
})()
