/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { activateExtension, TIMEOUT } from './integrationTestsUtilities'

describe('VSCode tests', async () => {
    it('activates the extension', async () => {
        await activateExtension('amazonwebservices.aws-toolkit-vscode')
    }).timeout(TIMEOUT)
})
