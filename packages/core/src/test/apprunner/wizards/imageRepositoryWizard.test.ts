/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRunner } from 'aws-sdk'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import {
    AppRunnerImageRepositoryWizard,
    ImageIdentifierForm,
    TaggedEcrRepository,
} from '../../../apprunner/wizards/imageRepositoryWizard'

describe('AppRunnerImageRepositoryWizard', function () {
    let tester: WizardTester<AppRunner.SourceConfiguration>
    let repoTester: WizardTester<AppRunner.ImageRepository>

    beforeEach(async function () {
        const wizard = new AppRunnerImageRepositoryWizard({} as any, {} as any) // the clients will never be called
        tester = await createWizardTester(wizard)
        repoTester = tester.ImageRepository
    })

    it('prompts for identifier, port, and environment variables', function () {
        repoTester.ImageIdentifier.assertShow()
        repoTester.ImageConfiguration.Port.assertShow()
        repoTester.ImageConfiguration.RuntimeEnvironmentVariables.assertShow()
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

describe('ImageIdentifierForm', function () {
    let tester: WizardTester<{ repo: TaggedEcrRepository }>

    beforeEach(async function () {
        const form = new ImageIdentifierForm({} as any) // ecr will never be called
        tester = await createWizardTester(form)
    })

    it('asks for tag if not provided', function () {
        tester.repo.tag.assertDoesNotShow()
        tester.repo.applyInput({ repositoryName: 'name', repositoryArn: '', repositoryUri: '' })
        tester.repo.tag.assertShow()
    })

    it('skips tag step if given', function () {
        tester.repo.applyInput({ repositoryName: 'name', repositoryArn: '', repositoryUri: '', tag: 'latest' })
        tester.repo.tag.assertDoesNotShow()
    })
})
