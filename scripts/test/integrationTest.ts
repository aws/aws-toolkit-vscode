/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolve } from 'path'
import { integrationSuite, runToolkitTests } from './launchTestUtilities'
;(async () => {
    await runToolkitTests(integrationSuite, resolve('dist', 'src', 'integrationTest', 'index.js'))
})()
