/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import {
    CreateAppRunnerServiceForm,
    CreateServiceRequest,
} from '../../../apprunner/wizards/apprunnerCreateServiceWizard'
import { createFormTester, FormTester } from '../../../test/shared/wizards/wizardTestUtils'
import { IamClient } from '../../../shared/clients/iamClient'
import { AppRunnerImageRepositoryForm } from '../../../apprunner/wizards/imageRepositoryWizard'
import { AppRunnerCodeRepositoryForm } from '../../../apprunner/wizards/codeRepositoryWizard'
import { EcrClient } from '../../../shared/clients/ecrClient'
import { AppRunnerClient } from '../../../shared/clients/apprunnerClient'
import { GitExtension } from '../../../shared/extensions/git'
import { QuickInputToggleButton } from '../../../shared/ui/buttons'

describe('CreateServiceWizard', function () {
    let tester: FormTester<CreateServiceRequest>

    beforeEach(function () {
        const iamClient: IamClient = {} as any
        const ecrClient: EcrClient = {} as any
        const apprunnerClient: AppRunnerClient = {} as any
        const gitExtension: GitExtension = {} as any

        const fakeContext = {
            iamClient,
            apprunnerClient,
            imageRepositoryForm: new AppRunnerImageRepositoryForm(ecrClient, iamClient),
            codeRepositoryForm: new AppRunnerCodeRepositoryForm(apprunnerClient, gitExtension),
            autoDeployButton: new QuickInputToggleButton({} as any, {} as any),
        }

        const form = new CreateAppRunnerServiceForm(fakeContext)
        tester = createFormTester(form)
    })

    describe('CreateAppRunnerServiceForm', function () {
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
