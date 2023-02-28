/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import { beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { resetCodeWhispererGlobalVariables } from '../testUtil'
// import { showConnectionPrompt, awsIdSignIn} from "../../../codewhisperer/util/showSsoPrompt";
import { awsIdSignIn} from "../../../codewhisperer/util/showSsoPrompt"
// import { stub } from '../../utilities/stubber'
// import { showQuickPick } from '../../../shared/ui/pickerPrompter';
// import { createQuickPickPrompterTester } from "../../shared/ui/testUtils";
// import { getTestWindow } from '../../shared/vscode/window'
import { getTestLogger } from '../../globalSetup.test'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'

describe('awsIdSignIn', function () {

    beforeEach(function () {
        resetCodeWhispererGlobalVariables()

    })

    afterEach(function () {
        sinon.restore()
    })

    it('logs that AWS ID sign in was selected', async function () {
        sinon.stub(AuthUtil.instance, 'connectToAwsBuilderId').resolves()
        sinon.stub(vscode.commands, 'executeCommand')
        await awsIdSignIn()
        assert.strictEqual(getTestLogger().getLoggedEntries()[0],'selected AWS ID sign in')
    })
})
