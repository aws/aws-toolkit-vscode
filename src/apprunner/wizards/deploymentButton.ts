/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as vscode from 'vscode'

import { QuickInputButton, QuickInputToggleButton } from '../../shared/ui/buttons'
import { apprunnerPricingUrl } from '../../shared/constants'
import { PromptSettings } from '../../shared/settings'
import { getIcon } from '../../shared/icons'

const localize = nls.loadMessageBundle()

function makeDeployButtons() {
    const autoDeploymentsEnable: QuickInputButton<void> = {
        iconPath: getIcon('vscode-sync-ignore'),
        tooltip: localize('AWS.apprunner.buttons.enableAutoDeploy', 'Turn on automatic deployment'),
    }

    const autoDeploymentsDisable: QuickInputButton<void> = {
        iconPath: getIcon('vscode-sync'),
        tooltip: localize('AWS.apprunner.buttons.disableAutoDeploy', 'Turn off automatic deployment'),
    }

    return [autoDeploymentsDisable, autoDeploymentsEnable]
}

async function showDeploymentCostNotification(): Promise<void> {
    const settings = PromptSettings.instance

    if (await settings.isPromptEnabled('apprunnerNotifyPricing')) {
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
                settings.disablePrompt('apprunnerNotifyPricing')
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
