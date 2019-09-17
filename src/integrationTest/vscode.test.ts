/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { activateExtension, EXTENSION_NAME_AWS_TOOLKIT, TIMEOUT } from './integrationTestsUtilities'

describe('VSCode tests', async () => {
    it('activates the extension', async () => {
        await activateExtension(EXTENSION_NAME_AWS_TOOLKIT)
    }).timeout(TIMEOUT)
})
