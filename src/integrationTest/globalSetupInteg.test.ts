/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before/After hooks for all integration tests.
 */
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { activateExtension } from './integrationTestsUtilities'
import { getLogger } from '../shared/logger/logger'

// ASSUMPTION: Tests are not run concurrently

before(async () => {
    // Needed for getLogger().
    await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
})

beforeEach(async function() {})

afterEach(async function() {})
