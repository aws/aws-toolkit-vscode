/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import assert from 'assert'
import * as fs from 'fs-extra'
import { writeFileSync } from 'fs-extra'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { UploadLambdaWizard, UploadLambdaWizardState, LambdaFunction } from '../../../lambda/commands/uploadLambda'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

describe('UploadLambdaWizard', function () {
    let tester: WizardTester<UploadLambdaWizardState>

    describe('invoked from command palette', function () {
        beforeEach(async () => {
            tester = await createWizardTester(new UploadLambdaWizard())
        })

        it('shows all but build prompts', function () {
            tester.lambda.region.assertShow(1)
            tester.uploadType.assertShow(2)
            tester.targetUri.assertShow(3)
            tester.lambda.name.assertShow(4)
            tester.confirmedDeploy.assertShow(5)
        })
    })

    describe('invoked from lambda node', function () {
        beforeEach(async function () {
            tester = await createWizardTester(
                new UploadLambdaWizard({ name: 'lambdaName', region: 'us-east-1', configuration: {} } as LambdaFunction)
            )
        })

        it('shows build prompt when directory is chosen', function () {
            tester.uploadType.applyInput('directory')
            tester.directoryBuildType.assertShow()
            tester.targetUri.assertShow()
            tester.confirmedDeploy.assertShow()
        })
        it('no build prompt when zip is chosen', function () {
            tester.uploadType.applyInput('zip')
            tester.directoryBuildType.assertDoesNotShow()
            tester.targetUri.assertShow()
            tester.confirmedDeploy.assertShow()
        })
    })

    describe('invoked from directory', function () {
        let tempDir: string
        let invokePath: vscode.Uri
        beforeEach(async function () {
            tempDir = await makeTemporaryToolkitFolder()
            invokePath = vscode.Uri.file(tempDir)
            tester = await createWizardTester(new UploadLambdaWizard(undefined, invokePath))
        })
        afterEach(async function () {
            await fs.remove(tempDir)
        })

        it('skip select directory, auto selected', function () {
            tester.lambda.region.assertShow(1)
            tester.uploadType.assertDoesNotShow()
            tester.uploadType.assertValue('directory')
            tester.targetUri.assertDoesNotShow()
            tester.targetUri.assertValue(invokePath)
            tester.lambda.name.assertShow(2)
            tester.confirmedDeploy.assertShow(3)
        })
    })

    describe('invoked from template', function () {
        let tempDir: string
        let tempDirUri: vscode.Uri
        let invokePath: vscode.Uri
        beforeEach(async function () {
            tempDir = await makeTemporaryToolkitFolder()
            tempDirUri = vscode.Uri.file(tempDir)
            writeFileSync(path.join(tempDir, 'template.yaml'), '')
            invokePath = vscode.Uri.file(path.join(tempDir, 'template.yaml'))
            tester = await createWizardTester(new UploadLambdaWizard(undefined, invokePath))
        })
        afterEach(async function () {
            await fs.remove(tempDir)
        })

        it('skip select directory, auto selected', function () {
            tester.lambda.region.assertShow(1)
            tester.uploadType.assertDoesNotShow()
            tester.uploadType.assertValue('directory')
            tester.targetUri.assertDoesNotShow()
            assert.strictEqual(tester.targetUri.value?.fsPath, tempDirUri.fsPath)
            tester.lambda.name.assertShow(2)
            tester.confirmedDeploy.assertShow(3)
        })
    })
})
