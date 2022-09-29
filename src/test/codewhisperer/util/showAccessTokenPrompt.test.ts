/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { DefaultCodeWhispererClient } from '../../../codewhisperer/client/codewhisperer'
import { exposeEmitters } from '../../shared/vscode/testUtils'
import { showAccessTokenPrompt } from '../../../codewhisperer/util/showAccessTokenPrompt'
import { sleep } from '../../../shared/utilities/timeoutUtils'

function stubQuickInputs() {
    const picker = exposeEmitters(vscode.window.createQuickPick(), ['onDidAccept', 'onDidChangeValue'])

    const inputBox = exposeEmitters(vscode.window.createInputBox(), ['onDidAccept', 'onDidChangeValue'])
    sinon.stub(vscode.window, 'createQuickPick').returns(picker)
    sinon.stub(vscode.window, 'createInputBox').returns(inputBox)

    return { picker, inputBox }
}

describe('showAccessTokenPrompt', function () {
    afterEach(function () {
        sinon.restore()
    })

    it('shows an error message when the backend rejects the user input', async function () {
        const mockClient: DefaultCodeWhispererClient = new DefaultCodeWhispererClient()
        const { picker, inputBox } = stubQuickInputs()
        sinon.stub(mockClient, 'getAccessToken').rejects(new Error('Invalid access code. Please re-enter.'))

        showAccessTokenPrompt(mockClient, () => {})

        picker.value = 'bad input'
        picker.fireOnDidAccept()

        await sleep()
        assert.strictEqual(inputBox.validationMessage, 'Invalid access code. Please re-enter.')
    })

    it('shows an error message for empty user input', async function () {
        const mockClient: DefaultCodeWhispererClient = new DefaultCodeWhispererClient()
        const { picker, inputBox } = stubQuickInputs()
        sinon.stub(mockClient, 'getAccessToken').rejects(new Error('Invalid access code. Please re-enter.'))

        showAccessTokenPrompt(mockClient, () => {})

        picker.value = ''
        picker.fireOnDidAccept()

        await sleep()
        assert.strictEqual(inputBox.validationMessage, 'Invalid access code. Please re-enter.')
    })

    it('executes the callback parameter for valid user input', async function () {
        let out
        const setToken = (token: string) => {
            out = token
        }
        const mockClient: DefaultCodeWhispererClient = new DefaultCodeWhispererClient()
        const mockServerResult = {
            accessToken: 'token',
        }
        const { picker } = stubQuickInputs()
        sinon.stub(mockClient, 'getAccessToken').resolves(mockServerResult)
        showAccessTokenPrompt(mockClient, setToken)
        picker.value = 'token'
        picker.fireOnDidAccept()

        await sleep()
        assert.strictEqual(picker.value, out)
    })
})
