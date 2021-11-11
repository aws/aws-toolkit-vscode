/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { createFolderPrompt } from '../../../../shared/ui/common/location'
import { WIZARD_RETRY } from '../../../../shared/wizards/wizard'
import { createQuickPickTester, QuickPickTester } from '../testUtils'

describe('createLocationPrompt', function () {
    const folders = [
        { name: 'folder1', uri: vscode.Uri.file('folder1'), index: 1 },
        { name: 'folder2', uri: vscode.Uri.file('folder2'), index: 2 },
    ]
    let openDialog: sinon.SinonStub<Parameters<typeof vscode.window.showOpenDialog>>
    let tester: QuickPickTester<vscode.Uri>

    beforeEach(function () {
        openDialog = sinon.stub(vscode.window, 'showOpenDialog')
        tester = createQuickPickTester(createFolderPrompt(folders))
    })

    afterEach(function () {
        sinon.restore()
    })

    it('shows a list of folders to choose from', async function () {
        tester.assertItems([/folder1/, /folder2/, /Select a folder/])
        tester.assertTitle('Select a folder')
        tester.acceptItem(/folder1/)
        await tester.result(folders[0].uri)
    })

    it('can open a dialog to select another folder', async function () {
        const newFolder = vscode.Uri.file('new-folder')
        openDialog.resolves([newFolder])
        tester.acceptItem(/Select a folder/)
        await tester.result(newFolder)
    })

    it('retries if user closes out of the dialog', async function () {
        openDialog.resolves([])
        tester.acceptItem(/Select a folder/)
        await tester.result(WIZARD_RETRY)
    })
})
