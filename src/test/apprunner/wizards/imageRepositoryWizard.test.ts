/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRunner } from 'aws-sdk'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { AppRunnerImageRepositoryWizard } from '../../../apprunner/wizards/imageRepositoryWizard'

describe('AppRunnerImageRepositoryWizard', function () {
    let tester: WizardTester<AppRunner.SourceConfiguration>
    let repoTester: Omit<WizardTester<AppRunner.ImageRepository>, 'printInfo' | 'runTester'>

    beforeEach(function () {
        const wizard = new AppRunnerImageRepositoryWizard({} as any, {} as any)
        tester = createWizardTester(wizard)
        repoTester = tester.ImageRepository
    })

    it('prompts for identifier, port, and environment variables', function () {
        repoTester.ImageIdentifier.assertShowFirst()
        repoTester.ImageConfiguration.Port.assertShowSecond()
        repoTester.ImageConfiguration.RuntimeEnvironmentVariables.assertShowThird()
        repoTester.assertShowCount(3)
    })

    it('sets image repository type', function () {
        repoTester.ImageRepositoryType.assertValue(undefined)
        repoTester.ImageIdentifier.applyInput('public.ecr.aws.com/testimage:latest')
        repoTester.ImageRepositoryType.assertValue('ECR_PUBLIC')
        repoTester.ImageIdentifier.applyInput('12351232424.dkr.ecr.us-east-1.amazonaws.com/testrepo:latest')
        repoTester.ImageRepositoryType.assertValue('ECR')
    })

    it('sets "AutoDeploymentsEnabled" to false by default', function () {
        tester.AutoDeploymentsEnabled.assertValue(false)
    })

    it('prompts for role if not public', function () {
        repoTester.ImageRepositoryType.applyInput('ECR')
        tester.AuthenticationConfiguration.AccessRoleArn.assertShow()

        repoTester.ImageRepositoryType.applyInput('ECR_PUBLIC')
        tester.AuthenticationConfiguration.AccessRoleArn.assertDoesNotShow()
    })
})
