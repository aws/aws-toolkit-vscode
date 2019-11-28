/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join, resolve } from 'path'
import { launchVsCodeTest } from './launchTestUtilities'

// tslint:disable-next-line: no-floating-promises
;(async () => {
    const cwd = process.cwd()
    await launchVsCodeTest({
        extensionDevelopmentPath: cwd,
        extensionTestsPath: resolve(cwd, 'out', 'src', 'integrationTest', 'index.js'),
        workspacePath: join(cwd, 'out', 'src', 'integrationTest-samples')
    })
})()
