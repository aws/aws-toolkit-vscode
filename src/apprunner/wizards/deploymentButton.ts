/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as vscode from 'vscode'

import { QuickInputButton, QuickInputToggleButton } from '../../shared/ui/buttons'
import { apprunnerPricingUrl, extensionSettingsPrefix } from '../../shared/constants'
import { DefaultSettingsConfiguration } from '../../shared/settingsConfiguration'
import globals from '../../shared/extensionGlobals'

const localize = nls.loadMessageBundle()

function makeDeployButtons() {
    const autoDeploymentsEnable: QuickInputButton<void> = {
        iconPath: {
            light: globals.iconPaths.light.syncIgnore,
            dark: globals.iconPaths.dark.syncIgnore,
        },
        tooltip: localize('AWS.apprunner.buttons.enableAutoDeploy', 'Turn on automatic deployment'),
    }

    const autoDeploymentsDisable: QuickInputButton<void> = {
        iconPath: {
            light: globals.iconPaths.light.sync,
            dark: globals.iconPaths.dark.sync,
        },
        tooltip: localize('AWS.apprunner.buttons.disableAutoDeploy', 'Turn off automatic deployment'),
    }

    return [autoDeploymentsDisable, autoDeploymentsEnable]
}

async function showDeploymentCostNotification(): Promise<void> {
    const settingsConfig = new DefaultSettingsConfiguration(extensionSettingsPrefix)
    if (await settingsConfig.isPromptEnabled('apprunnerNotifyPricing')) {
        const notice = localize(
            'aws.apprunner.createService.priceNotice.message',
            'App Runner automatic deployments incur an additional cost.'
        )
        const viewPricing = localize('aws.apprunner.createService.priceNotice.view', 'View Pricing')
        const dontShow = localize('aws.generic.doNotShowAgain', "Don't Show Again")
        const pricingUri = vscode.Uri.parse(apprunnerPricingUrl)

        vscode.window.showInformationMessage(notice, viewPricing, dontShow).then(async button => {
            if (button === viewPricing) {
                vscode.env.openExternal(pricingUri)
                await showDeploymentCostNotification()
            } else if (button === dontShow) {
                settingsConfig.disablePrompt('apprunnerNotifyPricing')
            }
        })
    }
}

export function makeDeploymentButton() {
    const [autoDeploymentsDisable, autoDeploymentsEnable] = makeDeployButtons()

    return new QuickInputToggleButton(autoDeploymentsDisable, autoDeploymentsEnable, {
        onCallback: showDeploymentCostNotification,
    })
}
