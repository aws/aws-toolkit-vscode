/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRunner, IAM } from 'aws-sdk'
import { createCommonButtons, QuickInputToggleButton } from '../../shared/ui/buttons'
import { EcrClient, EcrRepository } from '../../shared/clients/ecrClient'
import * as input from '../../shared/ui/inputPrompter'
import * as nls from 'vscode-nls'
import { Prompter } from '../../shared/ui/prompter'
import { Wizard } from '../../shared/wizards/wizard'
import { WizardForm } from '../../shared/wizards/wizardForm'
import { createVariablesPrompter } from '../../shared/ui/common/environmentVariables'
import { makeDeploymentButton } from './deploymentButton'
import { IamClient } from '../../shared/clients/iamClient'
import { createRolePrompter } from '../../shared/ui/common/roles'
import { isCloud9 } from '../../shared/extensionUtilities'
import { createEcrPrompter } from '../../shared/ui/common/ecrRepository'

const localize = nls.loadMessageBundle()

const APP_RUNNER_ECR_ENTITY = 'build.apprunner.amazonaws'

export type TaggedEcrRepository = EcrRepository & { tag?: string }

function createEcrRole(client: IamClient): Promise<IAM.Role> {
    const policy = {
        Version: '2008-10-17',
        Statement: [
            {
                Sid: '',
                Effect: 'Allow',
                Principal: {
                    Service: ['build.apprunner.amazonaws.com'],
                },
                Action: 'sts:AssumeRole',
            },
        ],
    }
    const ecrPolicy = 'arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess'

    return client
        .createRole({
            RoleName: `${isCloud9() ? 'Cloud9-' : ''}AppRunnerECRAccessRole${
                Math.floor(Math.random() * 1000000000) + 1000
            }`,
            AssumeRolePolicyDocument: JSON.stringify(policy),
        })
        .then(resp => {
            const role = resp.Role
            return client.attachRolePolicy({ RoleName: role.RoleName, PolicyArn: ecrPolicy }).then(() => role)
        })
}

function createPortPrompter(): Prompter<string> {
    const validatePort = (port: string) => {
        if (isNaN(Number(port)) || port === '') {
            return localize('AWS.apprunner.createService.selectPort.invalidPort', 'Port must be a number')
        }

        return undefined
    }

    return input.createInputBox({
        validateInput: validatePort,
        title: localize('AWS.apprunner.createService.selectPort.title', 'Enter a port for the new service'),
        placeholder: 'Enter a port',
        buttons: createCommonButtons(),
    })
}

function createImageRepositorySubForm(
    ecrClient: EcrClient,
    autoDeployButton: QuickInputToggleButton
): WizardForm<AppRunner.ImageRepository> {
    const subform = new WizardForm<AppRunner.ImageRepository>()
    const form = subform.body

    form.ImageIdentifier.bindPrompter(() =>
        createEcrPrompter(ecrClient).transform(resp => `${resp.repo.repositoryUri}:${resp.repo.tag}`)
    )

    function isPublic(imageRepo: string): boolean {
        return imageRepo.search(/^public.ecr.aws/) !== -1
    }

    form.ImageRepositoryType.setDefault(state => (isPublic(state.ImageIdentifier) ? 'ECR_PUBLIC' : 'ECR'), {
        dependencies: [form.ImageIdentifier],
    })

    form.ImageConfiguration.Port.bindPrompter(() => createPortPrompter())
    form.ImageConfiguration.RuntimeEnvironmentVariables.bindPrompter(() =>
        createVariablesPrompter(createCommonButtons())
    )

    return subform
}

export class AppRunnerImageRepositoryWizard extends Wizard<AppRunner.SourceConfiguration> {
    constructor(ecrClient: EcrClient, iamClient: IamClient, autoDeployButton?: QuickInputToggleButton) {
        super()
        const form = this.form
        const rolePrompter = () =>
            createRolePrompter(iamClient, {
                title: localize('AWS.apprunner.createService.selectRole.title', 'Select a role to pull from ECR'),
                filter: role => (role.AssumeRolePolicyDocument ?? '').includes(APP_RUNNER_ECR_ENTITY),
                createRole: createEcrRole.bind(undefined, iamClient),
            }).transform(resp => resp.Arn)

        if (autoDeployButton === undefined) {
            autoDeployButton = makeDeploymentButton()
            form.AutoDeploymentsEnabled.setDefault(() => autoDeployButton!.state === 'on')
        }

        form.ImageRepository.applyBoundForm(createImageRepositorySubForm(ecrClient, autoDeployButton))
        form.AuthenticationConfiguration.AccessRoleArn.bindPrompter(rolePrompter, {
            showWhen: form => form.ImageRepository.ImageRepositoryType === 'ECR',
            dependencies: [form.ImageRepository.ImageRepositoryType],
        })
    }
}
