/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWizardTester, WizardTester } from '../shared/wizards/wizardTestUtils'
import { PresignedUrlWizard, PresignedUrlWizardOptions, PresignedUrlWizardState } from '../../s3/commands/presignedURL'

describe('PresignedUrlWizard', function () {
    let tester: WizardTester<PresignedUrlWizardState>
    const fileNodeInfo: PresignedUrlWizardOptions = {
        bucketname: 'mr bucket',
        region: 'outer space',
        key: 'key',
    }

    const folderNodeInfo: PresignedUrlWizardOptions = {
        bucketname: 'mr bucket',
        region: 'outer space',
        folderPrefix: 'main/folder',
    }

    it('shows all prompts - from command palette', function () {
        tester = createWizardTester(new PresignedUrlWizard())
        tester.region.assertShow(1)
        tester.signedUrlParams.operation.assertShow(2)
        tester.signedUrlParams.bucketName.assertShow(3)
        tester.signedUrlParams.key.assertShow(4)
        tester.signedUrlParams.time.assertShow(5)
    })

    it('show operation and time - GET url, from file node ', function () {
        tester = createWizardTester(new PresignedUrlWizard(fileNodeInfo))
        tester.region.assertDoesNotShow()
        tester.signedUrlParams.bucketName.assertDoesNotShow()
        tester.signedUrlParams.key.assertDoesNotShow()

        tester.signedUrlParams.operation.assertShowFirst()
        tester.signedUrlParams.time.assertShowSecond()
    })

    it('show operation, time, key - GET url, from folder/bucket node ', function () {
        tester = createWizardTester(new PresignedUrlWizard(folderNodeInfo))
        tester.region.assertDoesNotShow()
        tester.signedUrlParams.bucketName.assertDoesNotShow()

        tester.signedUrlParams.operation.assertShowFirst()
        tester.signedUrlParams.key.assertShowSecond()
        tester.signedUrlParams.time.assertShowThird()
    })

    it('skips key input - PUT url, from file node', function () {
        tester = createWizardTester(new PresignedUrlWizard(fileNodeInfo))
        tester.region.assertDoesNotShow()
        tester.signedUrlParams.bucketName.assertDoesNotShow()
        tester.signedUrlParams.operation.applyInput('putObject')

        tester.signedUrlParams.key.assertDoesNotShow()
        tester.signedUrlParams.time.assertShow()
    })
})
