/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolve } from 'path'
import { e2eSuite, runToolkitTests } from './launchTestUtilities'
;(async () => {
    await runToolkitTests(e2eSuite, resolve('dist', 'src', 'testE2E', 'index.js'))
})()
