/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWizardTester, WizardTester } from '../shared/wizards/wizardTestUtils'
import { PresignedUrlWizard, PresignedUrlWizardState } from '../../s3/commands/presignedURL'
import { S3FileNode } from '../../s3/explorer/s3FileNode'

describe('PresignedUrlWizard', function () {
    let tester: WizardTester<PresignedUrlWizardState>
    beforeEach(function () {
        tester = createWizardTester(
            new PresignedUrlWizard({
                bucket: { name: 'mr bucket', region: 'outer space' },
                file: { key: 'key' },
            } as S3FileNode)
        )
    })

    it('shows all prompts - from command palette', function () {
        tester = createWizardTester(new PresignedUrlWizard())
        tester.region.assertShow(1)
        tester.signedUrlParams.operation.assertShow(2)
        tester.signedUrlParams.bucketName.assertShow(3)
        tester.signedUrlParams.key.assertShow(4)
        tester.signedUrlParams.time.assertShow(5)
    })

    it('show operation and time - GET url, from node ', function () {
        tester.region.assertDoesNotShow()
        tester.signedUrlParams.bucketName.assertDoesNotShow()
        tester.signedUrlParams.key.assertDoesNotShow()

        tester.signedUrlParams.operation.assertShowFirst()
        tester.signedUrlParams.time.assertShowSecond()
    })

    it('show key input - PUT url, from node', function () {
        tester.region.assertDoesNotShow()
        tester.signedUrlParams.bucketName.assertDoesNotShow()
        tester.signedUrlParams.operation.applyInput('putObject')

        tester.signedUrlParams.key.assertShow()
        tester.signedUrlParams.time.assertShow()
    })

    it(`skips key prompt and uses node's file key if available`, function () {
        tester.signedUrlParams.key.assertDoesNotShow()
        tester.signedUrlParams.key.assertValue('key')
    })
})
