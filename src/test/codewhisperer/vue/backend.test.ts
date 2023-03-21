/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as sinon from 'sinon'
import { CodeWhispererWebview } from '../../../codewhisperer/vue/backend'
import { assertTelemetryCurried } from '../../testUtil' 

type Stub<T extends (...args: any[]) => any> = sinon.SinonStub<Parameters<T>, ReturnType<T>>

describe('CodeWhispererWebview', function () {
    let view: CodeWhispererWebview
    let commandSpy: Stub<typeof vscode.commands.executeCommand>

    beforeEach(function () {
        view = new CodeWhispererWebview
        commandSpy = sinon.stub(vscode.commands, 'executeCommand')
    })

    afterEach(function () {
        sinon.restore()
    })

    it('controlTrigger() emits telemetry and calls accept terms of service command', function () {
        view.controlTrigger()
        const assertTelemetry = assertTelemetryCurried('ui_click')
        assertTelemetry({ elementId: 'cwToS_accept' })
        assert.ok(commandSpy.calledWith('aws.codeWhisperer.acceptTermsOfService'))
    })

    it('cancelCodeSuggestion() emits telemetry calls cancel terms of service command', function () {
        view.cancelCodeSuggestion()
        const assertTelemetry = assertTelemetryCurried('ui_click')
        assertTelemetry({ elementId: 'cwToS_cancel' })
        assert.ok(commandSpy.calledWith('aws.codeWhisperer.cancelTermsOfService'))
    })

    it('isCloud() returns boolean', function (){
        const isCloud9Result = view.isCloud9()
        assert.ok(typeof isCloud9Result === 'boolean')
    })
})
