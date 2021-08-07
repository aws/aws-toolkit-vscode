/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRunner } from 'aws-sdk'
import * as nls from 'vscode-nls'
import {
    createBackButton,
    createExitButton,
    createHelpButton,
    QuickInputButton,
    QuickInputToggleButton,
} from '../../shared/ui/buttons'
import { ext } from '../../shared/extensionGlobals'
import * as input from '../../shared/ui/inputPrompter'
import * as picker from '../../shared/ui/pickerPrompter'
import { Prompter } from '../../shared/ui/prompter'
import { Wizard, WizardState } from '../../shared/wizards/wizard'
import { AppRunnerImageRepositoryWizard } from './imageRepositoryWizard'
import { AppRunnerCodeRepositoryWizard } from './codeRepositoryWizard'
import * as vscode from 'vscode'
import { BasicExitPrompterProvider } from '../../shared/ui/common/exitPrompter'
import { GitExtension } from '../../shared/extensions/git'
import { APPRUNNER_PRICING_URL } from '../../shared/constants'

const localize = nls.loadMessageBundle()

function makeDeployButtons() {
    const autoDeploymentsEnable: QuickInputButton<void> = {
        iconPath: new vscode.ThemeIcon('sync-ignored'),
        tooltip: localize('AWS.apprunner.buttons.enableAutoDeploy', 'Turn on automatic deployment'),
    }

    const autoDeploymentsDisable: QuickInputButton<void> = {
        iconPath: new vscode.ThemeIcon('sync'),
        tooltip: localize('AWS.apprunner.buttons.disableAutoDeploy', 'Turn off automatic deployment'),
    }

    return [autoDeploymentsDisable, autoDeploymentsEnable]
}

export function makeDeploymentButton() {
    const [autoDeploymentsDisable, autoDeploymentsEnable] = makeDeployButtons()

    return new QuickInputToggleButton(autoDeploymentsDisable, autoDeploymentsEnable, {
        onCallback: showDeploymentCostNotification,
    })
}

function makeButtons(helpUri?: string | vscode.Uri) {
    return [createHelpButton(helpUri), createBackButton(), createExitButton()]
}

// I'm sure this code could be reused in many places
const validateName = (name: string) => {
    const badNameRegExp = /[^A-Za-z0-9-_]/g
    if (!name || name.length < 4) {
        return localize('AWS.apprunner.createService.name.validation', 'Service names must be at least 4 characters')
    } else if (name.length > 40) {
        return localize(
            'AWS.apprunner.createService.name.validationExceeds',
            'Service names cannot be more than 40 characters'
        )
    } else if (name.match(/\s/)) {
        return localize(
            'AWS.apprunner.createService.name.validationWhitespace',
            'Service names cannot contain whitespace'
        )
    }

    let matches = name.match(badNameRegExp)
    if (name[0] === '_' || name[0] === '-') {
        matches = matches ? [name[0]].concat(matches) : [name[0]]
    }
    if (matches && matches.length > 0) {
        return localize(
            'AWS.apprunner.createService.name.validationBadChar',
            'Invalid character(s): {0}',
            Array.from(new Set(matches)).join('')
        )
    }

    return undefined
}

function createInstanceStep(): Prompter<AppRunner.InstanceConfiguration> {
    const enumerations = [
        [1, 2],
        [1, 3],
        [2, 4],
    ]

    const items: picker.DataQuickPickItem<AppRunner.InstanceConfiguration>[] = enumerations.map(e => ({
        label: `${e[0]} vCPUs, ${e[1]} GBs Memory`,
        data: { Cpu: `${e[0]} vCPU`, Memory: `${e[1]} GB` },
    }))

    return picker.createQuickPick(items, {
        title: localize('AWS.apprunner.createService.selectInstanceConfig.title', 'Select instance configuration'),
        buttons: makeButtons(),
    })
}

function showDeploymentCostNotification(): void {
    const shouldShow = ext.context.globalState.get('apprunner.deployments.notifyPricing', true)

    if (shouldShow) {
        const notice = localize(
            'aws.apprunner.createService.priceNotice.message',
            'App Runner automatic deployments incur an additional cost.'
        )
        const viewPricing = localize('aws.apprunner.createService.priceNotice.view', 'View Pricing')
        const dontShow = localize('aws.generic.doNotShowAgain', "Don't Show Again")
        const pricingUri = vscode.Uri.parse(APPRUNNER_PRICING_URL)

        vscode.window.showInformationMessage(notice, viewPricing, dontShow).then(button => {
            if (button === viewPricing) {
                vscode.env.openExternal(pricingUri)
                showDeploymentCostNotification()
            } else if (button === dontShow) {
                ext.context.globalState.update('apprunner.deployments.notifyPricing', false)
            }
        })
    }
}

function createSourcePrompter(
    autoDeployButton: QuickInputToggleButton
): Prompter<AppRunner.CreateServiceRequest['SourceConfiguration']> {
    const ecrPath = {
        label: 'ECR',
        data: { ImageRepository: {} } as AppRunner.SourceConfiguration,
        detail: localize(
            'AWS.apprunner.createService.ecr.detail',
            'Create a service from a public or private Elastic Container Registry repository'
        ),
    }

    const repositoryPath = {
        label: 'Repository',
        data: { CodeRepository: {} } as AppRunner.SourceConfiguration,
        detail: localize('AWS.apprunner.createService.repository.detail', 'Create a service from a GitHub repository'),
    }

    return picker.createQuickPick([ecrPath, repositoryPath], {
        title: localize('AWS.apprunner.createService.sourceType.title', 'Select a source code location type'),
        buttons: [autoDeployButton, ...makeButtons()],
    })
}

export class CreateAppRunnerServiceWizard extends Wizard<AppRunner.CreateServiceRequest> {
    public constructor(
        region: string,
        initState: WizardState<AppRunner.CreateServiceRequest> = {},
        implicitState: WizardState<AppRunner.CreateServiceRequest> = {}
    ) {
        super({
            initState,
            implicitState,
            exitPrompterProvider: new BasicExitPrompterProvider(),
        })

        const ecrClient = ext.toolkitClientBuilder.createEcrClient(region)
        const iamClient = ext.toolkitClientBuilder.createIamClient(region)
        const apprunnerClient = ext.toolkitClientBuilder.createAppRunnerClient(region)
        const autoDeployButton = makeDeploymentButton()
        const gitExtension = new GitExtension()
        const codeRepositoryWizard = new AppRunnerCodeRepositoryWizard(apprunnerClient, gitExtension, autoDeployButton)
        const imageRepositoryWizard = new AppRunnerImageRepositoryWizard(ecrClient, iamClient, autoDeployButton)

        const form = this.form

        form.SourceConfiguration.bindPrompter(() => createSourcePrompter(autoDeployButton))

        form.SourceConfiguration.applyBoundForm(imageRepositoryWizard.boundForm, {
            showWhen: state => state.SourceConfiguration?.ImageRepository !== undefined,
        })
        form.SourceConfiguration.applyBoundForm(codeRepositoryWizard.boundForm, {
            showWhen: state => state.SourceConfiguration?.CodeRepository !== undefined,
        })

        form.ServiceName.bindPrompter(() =>
            input.createInputBox({
                title: localize('AWS.apprunner.createService.name.title', 'Name your service'),
                validateInput: validateName, // TODO: we can check if names match any already made services
                buttons: makeButtons(),
            })
        )

        form.InstanceConfiguration.bindPrompter(() => createInstanceStep())
        form.SourceConfiguration.AutoDeploymentsEnabled.setDefault(() => autoDeployButton.state === 'on')
    }
}
