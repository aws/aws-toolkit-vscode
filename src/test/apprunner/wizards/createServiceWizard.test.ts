/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import { createWizardTester, WizardTester } from '../../../test/shared/wizards/wizardTestUtils'
import { AppRunner } from 'aws-sdk'
import { CreateAppRunnerServiceWizard } from '../../../apprunner/wizards/apprunnerCreateServiceWizard'
import { ext } from '../../../shared/extensionGlobals'

describe('CreateServiceWizard', function () {
    let tester: WizardTester<AppRunner.CreateServiceRequest>
    let lastClientBuilder: typeof ext.toolkitClientBuilder

    before(function () {
        lastClientBuilder = ext.toolkitClientBuilder
        ext.toolkitClientBuilder = {
            createAppRunnerClient: () => ({} as any),
            createEcrClient: () => ({} as any),
            createIamClient: () => ({} as any),
        } as any
    })

    beforeEach(function () {
        const wizard = new CreateAppRunnerServiceWizard('')
        tester = createWizardTester(wizard)
    })

    after(function () {
        ext.toolkitClientBuilder = lastClientBuilder
    })

    describe('CreateAppRunnerServiceWizard', function () {
        it('prompts for source first', function () {
            tester.SourceConfiguration.assertShowFirst()
        })

        it('prompts for role ARN if choosing private ECR', function () {
            tester.SourceConfiguration.applyInput({ ImageRepository: { ImageRepositoryType: 'ECR' } as any })
            tester.SourceConfiguration.AuthenticationConfiguration.AccessRoleArn.assertShow()
        })

        it('prompts for connection ARN if choosing Repository', function () {
            tester.SourceConfiguration.applyInput({ CodeRepository: {} as any })
            tester.SourceConfiguration.AuthenticationConfiguration.ConnectionArn.assertShow()
        })

        it('prompts for name before instance', function () {
            tester.ServiceName.assertShowSecond() // TODO: write a 'assertShowBefore' that accepts another form element as input
            tester.InstanceConfiguration.assertShowThird()
        })

        it('sets auto-deployment to "off" by default', function () {
            tester.SourceConfiguration.AutoDeploymentsEnabled.assertValue(false)
        })

        it('prompts for ECR or GitHub repository', function () {
            tester.SourceConfiguration.assertShow()
            tester.SourceConfiguration.CodeRepository.assertDoesNotShowAny()
            tester.SourceConfiguration.ImageRepository.assertDoesNotShowAny()

            tester.SourceConfiguration.applyInput({ CodeRepository: {} as any })
            tester.SourceConfiguration.CodeRepository.assertShowAny()

            tester.SourceConfiguration.applyInput({ ImageRepository: {} as any })
            tester.SourceConfiguration.ImageRepository.assertShowAny()
        })
    })
})
