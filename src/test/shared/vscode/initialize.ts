/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ext } from '../../../shared/extensionGlobals'

if (!!process.env.CODE_TEST_PATH) {
    // If running integration tests, use the real VS Code API.
    // tslint:disable-next-line:no-var-requires
    require('../../../shared/vscode/default/initialize')
} else {
    // If running unit tests, use the mocked VS Code API.
    // tslint:disable-next-line:no-unsafe-any
    ext.vscode = new (require('./mockContext').MockVSCodeContext)()
}
