/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import { createVariablesPrompter } from '../../../../shared/ui/common/environmentVariables'
import { createQuickPickTester, QuickPickTester } from '../testUtils'
import { WizardControl } from '../../../../shared/wizards/util'

describe('createVariablesPrompter', function () {
    const FILE_SELECTION = 'Use file...'
    type OpenDialog = typeof vscode.window['showOpenDialog']
    type ReadFile = typeof fs.promises['readFile']
    let tester: QuickPickTester<{ [key: string]: string }>
    let openDialog: sinon.SinonStub<Parameters<OpenDialog>, ReturnType<OpenDialog>>
    let readFile: sinon.SinonStub<Parameters<ReadFile>, ReturnType<ReadFile>>

    beforeEach(function () {
        openDialog = sinon.stub(vscode.window, 'showOpenDialog')
        readFile = sinon.stub(fs.promises, 'readFile')
        tester = createQuickPickTester(createVariablesPrompter())
    })

    afterEach(function () {
        sinon.restore()
    })

    it('returns an empty mapping if choosing skip', async function () {
        tester.acceptItem('Skip')
        assert.deepStrictEqual(await tester.result(), {})
    })

    it('can select a file to load', async function () {
        const file = vscode.Uri.parse('file')
        tester.acceptItem(FILE_SELECTION)
        openDialog.returns(Promise.resolve([file]))
        readFile.returns(
            Promise.resolve(Buffer.from('VAR1=VALUE1\nVAR2=\'VALUE2\'\nVAR3="\'VALUE3\'"\nVAR4="VALUE\\n4"'))
        )
        assert.deepStrictEqual(await tester.result(), {
            VAR1: 'VALUE1',
            VAR2: 'VALUE2',
            VAR3: "'VALUE3'",
            VAR4: 'VALUE\n4',
        })
    })

    it('retries the prompt if no environment variables were found', async function () {
        const file = vscode.Uri.parse('file')
        tester.acceptItem(FILE_SELECTION)
        openDialog.returns(Promise.resolve([file]))
        readFile.returns(Promise.resolve(Buffer.from('VAR1')))
        assert.strictEqual(await tester.result(), WizardControl.Retry)
    })

    it('retries the prompt if cancel open dialog', async function () {
        tester.acceptItem(FILE_SELECTION)
        openDialog.returns(Promise.resolve(undefined))
        assert.strictEqual(await tester.result(), WizardControl.Retry)
    })

    it('retries the prompt for a bad file load', async function () {
        const badFile = vscode.Uri.parse('badFile')
        tester.acceptItem(FILE_SELECTION)
        openDialog.returns(Promise.resolve([badFile]))
        readFile.callsFake(() => Promise.reject(new Error('Bad file')))
        assert.strictEqual(await tester.result(), WizardControl.Retry)
    })
})
