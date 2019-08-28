/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { launchVsCodeTest } from './launchTestUtilities'

// tslint:disable-next-line: no-floating-promises
;(async () => {
    const cwd = process.cwd()
    await launchVsCodeTest({
        extensionDevelopmentPath: cwd,
        extensionTestsPath: path.resolve(cwd, 'out', 'src', 'test', 'index.js')
    })
})()
