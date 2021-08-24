/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as vscode from 'vscode'
import { QuickInputButton, QuickInputToggleButton } from '../../shared/ui/buttons'
import { APPRUNNER_PRICING_URL, extensionSettingsPrefix } from '../../shared/constants'
import { DefaultSettingsConfiguration } from '../../shared/settingsConfiguration'

const localize = nls.loadMessageBundle()

async function showDeploymentCostNotification(): Promise<void> {
    const settingsConfig = new DefaultSettingsConfiguration(extensionSettingsPrefix)

    if (await settingsConfig.shouldDisplayPrompt('suppressApprunnerNotifyPricing')) {
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
                settingsConfig.disablePrompt('suppressApprunnerNotifyPricing')
            }
        })
    }
}

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
