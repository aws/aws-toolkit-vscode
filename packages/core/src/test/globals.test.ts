/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { FakeExtensionContext } from './fakeExtensionContext'
import { initialize } from '../shared/extensionGlobals'
import { CloudFormationTemplateRegistry } from '../shared/fs/templateRegistry'
import { CodelensRootRegistry } from '../shared/fs/codelensRootRegistry'

describe('extensionGlobals', function () {
    it('initializes global values', async function () {
        const extensionContext = await FakeExtensionContext.create()
        const globals = initialize(extensionContext, false)
        /**
         * Tests use module scope globals created in extensionGlobals.ts and
         * bootstrapped in global mocha beforeEach hook, however, calling
         * initialize replaces that object, nullifying the bootstrapping.
         * globals in wrapped a Proxy that requires all properties to have been
         * properly set before access. The global mocha afterEach hook attempts
         * to clean up some of those properties, throwing errors. So a minimal
         * bootstrapping is duplicated here.
         */
        globals.templateRegistry = (async () => new CloudFormationTemplateRegistry())()
        globals.codelensRootRegistry = new CodelensRootRegistry()
        assert.equal(globals.isEmbedded, false)
    })

    // TODO: cannot test this as mocked vscode.window is not modifiable
    it('initializes global values for embedded mode')
})
