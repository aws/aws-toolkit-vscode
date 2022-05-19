/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { UploadLambdaWizard, UploadLambdaWizardState, LambdaFunction } from '../../../lambda/commands/uploadLambda'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

describe('UploadLambdaWizard', function () {
    let tester: WizardTester<UploadLambdaWizardState>

    describe('invoked from command palette', function () {
        beforeEach(function () {
            tester = createWizardTester(new UploadLambdaWizard())
        })

        it('shows all but build prompts', function () {
            tester.lambda.region.assertShow()
            tester.uploadType.assertShow()
            tester.targetUri.assertShow()
            tester.lambda.name.assertShow()
            tester.confirmedDeploy.assertShow()
        })
    })

    describe('invoked from lambda node', function () {
        beforeEach(function () {
            tester = createWizardTester(
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
            tester = createWizardTester(new UploadLambdaWizard(undefined, invokePath))
        })

        it('skip select directory, auto selected', function () {
            tester.lambda.region.assertShow()
            tester.uploadType.assertShow()
            tester.targetUri.assertDoesNotShow()
            tester.targetUri.assertValue(invokePath)
            tester.lambda.name.assertShow()
            tester.confirmedDeploy.assertShow()
        })
    })
})
