/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import assert from 'assert'
import vscode from 'vscode'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { processTransformByQ } from '../../amazonqGumby/entrypoint'
import { transformByQState } from '../../codewhisperer/models/model'
import * as startTransformByQ from '../../codewhisperer/commands/startTransformByQ'

describe('EntryPointTest', () => {
    afterEach(function () {
        sinon.restore()
    })

    it.only('should show error message when start transformation attempted without active IdC', () => {
        sinon.stub(AuthUtil.instance, 'isEnterpriseSsoInUse').returns(false)
        const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage')
        processTransformByQ()
        assert.strictEqual(
            showErrorMessageStub.calledWith('Transform by Q requires an active IAM Identity Center connection'),
            true
        )
    })

    it.only('should start transformation when attempted with active IdC and no job is in-progress', () => {
        sinon.stub(AuthUtil.instance, 'isEnterpriseSsoInUse').returns(true)
        const startTransformByQWithProgressStub = sinon.stub(startTransformByQ, 'startTransformByQWithProgress')
        transformByQState.setToNotStarted()
        processTransformByQ()
        sinon.assert.calledOnce(startTransformByQWithProgressStub)
    })

    it.only('should show info message when start transformation attempted with active IdC and another job is in-progress', () => {
        sinon.stub(AuthUtil.instance, 'isEnterpriseSsoInUse').returns(true)
        const showInfoMessageStub = sinon.stub(vscode.window, 'showInformationMessage')
        transformByQState.setToRunning()
        processTransformByQ()
        assert.strictEqual(showInfoMessageStub.calledWith('Job is already in-progress'), true)
    })
})
