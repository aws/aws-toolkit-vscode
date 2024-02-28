/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { processTransformByQ } from '../../amazonqGumby/entrypoint'
import { transformByQState } from '../../codewhisperer/models/model'
import * as startTransformByQ from '../../codewhisperer/commands/startTransformByQ'

describe('EntryPointTest', () => {
    afterEach(function () {
        sinon.restore()
    })

    it('should not start transformation when attempted without active IdC', async () => {
        sinon.stub(AuthUtil.instance, 'isEnterpriseSsoInUse').returns(false)
        sinon.stub(AuthUtil.instance, 'isConnectionExpired').returns(true)
        const startTransformByQWithProgressStub = sinon.stub(startTransformByQ, 'startTransformByQWithProgress')
        transformByQState.setToNotStarted()
        await processTransformByQ()
        sinon.assert.notCalled(startTransformByQWithProgressStub)
    })

    it('should not start transformation when attempted with expired connection', async () => {
        sinon.stub(AuthUtil.instance, 'isEnterpriseSsoInUse').returns(true)
        sinon.stub(AuthUtil.instance, 'isConnectionExpired').returns(true)
        const startTransformByQWithProgressStub = sinon.stub(startTransformByQ, 'startTransformByQWithProgress')
        transformByQState.setToNotStarted()
        await processTransformByQ()
        sinon.assert.notCalled(startTransformByQWithProgressStub)
    })

    it('should start transformation when attempted with active IdC and no job is in-progress', async () => {
        sinon.stub(AuthUtil.instance, 'isEnterpriseSsoInUse').returns(true)
        sinon.stub(AuthUtil.instance, 'isConnectionExpired').returns(false)
        const startTransformByQWithProgressStub = sinon.stub(startTransformByQ, 'startTransformByQWithProgress')
        transformByQState.setToNotStarted()
        await processTransformByQ()
        sinon.assert.calledOnce(startTransformByQWithProgressStub)
    })
})
