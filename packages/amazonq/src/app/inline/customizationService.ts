/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AuthUtil,
    baseCustomization,
    CodeWhispererSource,
    createCommonButtons,
    Customization,
    customLearnMoreUri,
    DataQuickPickItem,
    localize,
    newCustomizationMessage,
    showMessageWithUrl,
    showQuickPick,
    vsCodeState,
} from 'aws-core-vscode/codewhisperer'
import {
    GetConfigurationFromServerParams,
    getConfigurationFromServerRequestType,
    UpdateConfigurationParams,
} from '@aws/language-server-runtimes/protocol'
import { codicon, Commands, getIcon, getLogger, globals, openUrl, VsCodeCommandArg } from 'aws-core-vscode/shared'
import * as vscode from 'vscode'
import { parse } from '@aws-sdk/util-arn-parser'
import { LanguageClient } from 'vscode-languageclient'
import { telemetry } from 'aws-core-vscode/telemetry'

/*
    This class is a consolidates core/src/codewhisperer/util/customizationUtil.ts and the customization commands into a class
    The main difference is in the getCustomizationsFromLsp and notifySelectedCustomizationToLsp functions
    The original file and commands can be deprecated later
 */
export class CustomizationService {
    constructor(private readonly client: LanguageClient) {}

    getNewCustomizationsAvailable() {
        return globals.globalState.tryGet('aws.amazonq.codewhisperer.newCustomizations', Number, 0)
    }

    public registerCustomization() {
        const selectCustomizationHandler = async (_: VsCodeCommandArg, source: CodeWhispererSource) => {
            if (AuthUtil.instance.isBuilderIdInUse()) {
                throw new Error(`Select Customizations are not supported with the Amazon Builder ID connection.`)
            }
            telemetry.ui_click.emit({ elementId: 'cw_selectCustomization_Cta' })
            await this.showCustomizationPrompt()
        }

        vscode.commands.registerCommand('_aws.amazonq.customization.select', selectCustomizationHandler)
    }

    async notifyNewCustomizations() {
        let availableCustomizations: Customization[] = []
        try {
            availableCustomizations = await this.getCustomizationsFromLsp()

            AuthUtil.instance.isCustomizationFeatureEnabled = true
        } catch (error) {
            // On receiving any error, we will disable the customization feature
            AuthUtil.instance.isCustomizationFeatureEnabled = false
            await this.setSelectedCustomization(baseCustomization, false)
            getLogger().error(`Failed to fetch customizations: %O`, error)
            return
        }

        const selectedCustomization = this.getSelectedCustomization()
        if (!this.isSelectedCustomizationAvailable(availableCustomizations, selectedCustomization)) {
            await this.switchToBaseCustomizationAndNotify()
        }

        const newCustomizations = this.getNewCustomizations(availableCustomizations)
        await this.setPersistedCustomizations(availableCustomizations)

        if (newCustomizations.length === 0) {
            return
        }

        await this.setNewCustomizationsAvailable(newCustomizations.length)

        const select = localize(
            'AWS.codewhisperer.customization.notification.new_customizations.select',
            'Select Customization'
        )
        const learnMore = localize(
            'AWS.codewhisperer.customization.notification.new_customizations.learn_more',
            'Learn More'
        )
        void vscode.window.showInformationMessage(newCustomizationMessage, select, learnMore).then(async (resp) => {
            if (resp === select) {
                this.showCustomizationPrompt().catch((e) => {
                    getLogger().error('showCustomizationPrompt failed: %s', (e as Error).message)
                })
            } else if (resp === learnMore) {
                // TODO: figure out the right uri
                void openUrl(vscode.Uri.parse(customLearnMoreUri))
            }
        })
    }

    private isSelectedCustomizationAvailable(available: Customization[], selected: Customization) {
        return selected.arn === '' || available.map((c) => c.arn).includes(selected.arn)
    }

    /**
     *
     * @param availableCustomizations
     * @returns customization diff of availableCustomizations vs. persisted customizations
     */
    private getNewCustomizations(availableCustomizations: Customization[]) {
        const persistedCustomizations = this.getPersistedCustomizations()
        return availableCustomizations.filter((c) => !persistedCustomizations.map((p) => p.arn).includes(c.arn))
    }

    /**
     * @returns customization selected by users, `baseCustomization` if none is selected
     */
    getSelectedCustomization(): Customization {
        if (
            !AuthUtil.instance.isCustomizationFeatureEnabled ||
            !AuthUtil.instance.isValidEnterpriseSsoInUse() ||
            !AuthUtil.instance.conn
        ) {
            return baseCustomization
        }

        const selectedCustomizationArr = globals.globalState.tryGet<{ [label: string]: Customization }>(
            'CODEWHISPERER_SELECTED_CUSTOMIZATION',
            Object,
            {}
        )
        const selectedCustomization = selectedCustomizationArr[AuthUtil.instance.conn.label]

        if (selectedCustomization && selectedCustomization.name !== '') {
            return selectedCustomization
        } else {
            return baseCustomization
        }
    }

    /**
     * @param customization customization to select
     * @param isOverride if the API call is made from us (Q) but not users' intent, set isOverride to TRUE
     * Override happens when ALL following conditions are met
     *  1. service returns non-empty override customization arn, refer to [featureConfig.ts]
     *  2. the override customization arn is different from the previous override customization if any. The purpose is to only do override once on users' behalf.
     */
    async setSelectedCustomization(customization: Customization, isOverride: boolean = false) {
        if (!AuthUtil.instance.isValidEnterpriseSsoInUse() || !AuthUtil.instance.conn) {
            return
        }
        if (isOverride) {
            const previousOverride = globals.globalState.tryGet<string>('aws.amazonq.customization.overrideV2', String)
            if (customization.arn === previousOverride) {
                return
            }
        }
        const selectedCustomizationObj = globals.globalState.tryGet<{ [label: string]: Customization }>(
            'CODEWHISPERER_SELECTED_CUSTOMIZATION',
            Object,
            {}
        )
        selectedCustomizationObj[AuthUtil.instance.conn.label] = customization
        getLogger().debug(`Selected customization ${customization.name} for ${AuthUtil.instance.conn.label}`)

        await globals.globalState.update('CODEWHISPERER_SELECTED_CUSTOMIZATION', selectedCustomizationObj)
        if (isOverride) {
            await globals.globalState.update('aws.amazonq.customization.overrideV2', customization.arn)
        }
        vsCodeState.isFreeTierLimitReached = false
        await Commands.tryExecute('aws.amazonq.refreshStatusBar')

        await this.notifySelectedCustomizationToLsp(customization.arn)
    }

    private getPersistedCustomizations(): Customization[] {
        if (!AuthUtil.instance.isValidEnterpriseSsoInUse() || !AuthUtil.instance.conn) {
            return []
        }
        const persistedCustomizationsObj = globals.globalState.tryGet<{ [label: string]: Customization[] }>(
            'CODEWHISPERER_PERSISTED_CUSTOMIZATIONS',
            Object,
            {}
        )
        return persistedCustomizationsObj[AuthUtil.instance.conn.label] || []
    }

    private async setPersistedCustomizations(customizations: Customization[]) {
        if (!AuthUtil.instance.isValidEnterpriseSsoInUse() || !AuthUtil.instance.conn) {
            return
        }
        const persistedCustomizationsObj = globals.globalState.tryGet<{ [label: string]: Customization[] }>(
            'CODEWHISPERER_PERSISTED_CUSTOMIZATIONS',
            Object,
            {}
        )
        persistedCustomizationsObj[AuthUtil.instance.conn.label] = customizations
        await globals.globalState.update('CODEWHISPERER_PERSISTED_CUSTOMIZATIONS', persistedCustomizationsObj)
    }

    private async setNewCustomizationsAvailable(num: number) {
        await globals.globalState.update('aws.amazonq.codewhisperer.newCustomizations', num)
        vsCodeState.isFreeTierLimitReached = false
    }

    private async showCustomizationPrompt() {
        await this.setNewCustomizationsAvailable(0)
        await showQuickPick(this.createCustomizationItems(), {
            title: localize('AWS.codewhisperer.customization.quickPick.title', 'Select a Customization'),
            placeholder: localize(
                'AWS.codewhisperer.customization.quickPick.placeholder',
                'You have access to the following customizations'
            ),
            buttons: createCommonButtons() as vscode.QuickInputButton[],
            compare: (a, b) => {
                if (a.invalidSelection) {
                    return -1
                }
                if (b.invalidSelection) {
                    return 1
                }
                return a.label < b.label ? -1 : 1
            },
            recentlyUsed: localize('AWS.codewhisperer.customization.selected', '   Connected'),
        })
    }

    private async createCustomizationItems() {
        const items = []
        const availableCustomizations = await this.getCustomizationsFromLsp()

        // Order matters
        // 1. read the old snapshot of customizations
        const persistedCustomizations = this.getPersistedCustomizations()

        // 2. update the customizations snapshot with the latest
        await this.setPersistedCustomizations(availableCustomizations)

        const selectedCustomization = this.getSelectedCustomization()
        if (!this.isSelectedCustomizationAvailable(availableCustomizations, selectedCustomization)) {
            await this.switchToBaseCustomizationAndNotify()
        }

        if (availableCustomizations.length === 0) {
            items.push(this.createBaseCustomizationItem())

            // TODO: finalize the url string with documentation
            void showMessageWithUrl(
                localize(
                    'AWS.codewhisperer.customization.noCustomizations.description',
                    'You dont have access to any Amazon Q customization. Contact your admin for access.'
                ),
                customLearnMoreUri,
                localize('AWS.codewhisperer.customization.notification.new_customizations.learn_more', 'Learn More'),
                'info'
            )
            return items
        }

        const persistedArns = persistedCustomizations.map((c) => c.arn)
        const customizationNameToCount = availableCustomizations.reduce((map, customization) => {
            if (customization.name) {
                map.set(customization.name, (map.get(customization.name) || 0) + 1)
            }

            return map
        }, new Map<string, number>())

        items.push(this.createBaseCustomizationItem())
        items.push(
            ...availableCustomizations.map((c) => {
                let shouldPrefixAccountId = false
                if (c.name) {
                    const cnt = customizationNameToCount.get(c.name) || 0
                    if (cnt > 1) {
                        shouldPrefixAccountId = true
                    }
                }

                return this.createCustomizationItem(c, persistedArns, shouldPrefixAccountId)
            })
        )
        return items
    }

    private createBaseCustomizationItem() {
        const label = codicon`${getIcon('vscode-circuit-board')} ${localize(
            'AWS.codewhisperer.customization.base.label',
            'Amazon Q foundation (Default)'
        )}`
        const selectedArn = this.getSelectedCustomization().arn
        return {
            label: label,
            onClick: async () => {
                await this.selectCustomization(baseCustomization)
            },
            detail: localize(
                'AWS.codewhisperer.customization.base.description',
                'Receive suggestions from Amazon Q base model'
            ),
            description: this.renderDescriptionText(),
            recentlyUsed: selectedArn === baseCustomization.arn,
        } as DataQuickPickItem<string>
    }

    private createCustomizationItem(
        customization: Customization,
        persistedArns: (string | undefined)[],
        shouldPrefixAccountId: boolean
    ) {
        const accountId = parse(customization.arn).accountId
        const displayedName = customization.name
            ? shouldPrefixAccountId
                ? accountId
                    ? `${customization.name} (${accountId})`
                    : `${customization.name}`
                : customization.name
            : 'unknown'

        const isNewCustomization = !persistedArns.includes(customization.arn)
        const label = codicon`${getIcon('vscode-circuit-board')} ${displayedName}`
        const selectedArn = this.getSelectedCustomization().arn
        return {
            label: label,
            onClick: async () => {
                await this.selectCustomization(customization)
            },
            detail:
                customization.description !== ''
                    ? customization.description
                    : localize('AWS.codewhisperer.customization.no.description.text', 'No description provided'),
            description: this.renderDescriptionText(isNewCustomization),
            data: customization.arn,
            recentlyUsed: selectedArn === customization.arn,
        } as DataQuickPickItem<string>
    }

    private async selectCustomization(customization: Customization) {
        // If the newly selected customization is same as the old one, do nothing
        const selectedCustomization = this.getSelectedCustomization()
        if (selectedCustomization.arn === customization.arn) {
            return
        }
        await this.setSelectedCustomization(customization, false)
        const suffix =
            customization.arn === baseCustomization.arn ? customization.name : `${customization.name} customization.`
        void vscode.window.showInformationMessage(
            localize(
                'AWS.codewhisperer.customization.selected.message',
                'Amazon Q suggestions are now coming from the {0}',
                suffix
            )
        )
    }

    async getCustomizationsFromLsp() {
        let items: Customization[] = []
        try {
            const response: { customizations: Customization[] } = await this.client.sendRequest(
                getConfigurationFromServerRequestType.method,
                {
                    section: 'aws.q',
                } as GetConfigurationFromServerParams
            )
            items = response.customizations
        } catch (e) {
            getLogger().error(`Failed to get customizations from LSP: ${e}`)
        }
        return items
    }

    async notifySelectedCustomizationToLsp(customizationArn: string) {
        this.client.sendNotification('workspace/didChangeConfiguration', {
            section: 'amazonQ',
            settings: {
                customization: customizationArn,
            },
        } as UpdateConfigurationParams)
    }

    // show notification that selected customization is not available, switching back to base
    private async switchToBaseCustomizationAndNotify() {
        await this.setSelectedCustomization(baseCustomization, false)
        const selectCustomizationLabel = localize(
            'AWS.codewhisperer.customization.notification.selectCustomization',
            'Select Another Customization'
        )
        const selection = await vscode.window.showWarningMessage(
            localize(
                'AWS.codewhisperer.customization.notification.selected_customization_not_available',
                'Selected Amazon Q customization is not available. Contact your administrator. Your instance of Amazon Q is using the foundation model.'
            ),
            selectCustomizationLabel
        )
        if (selection === selectCustomizationLabel) {
            await this.showCustomizationPrompt()
        }
    }

    private renderDescriptionText(isNewCustomization: boolean = false) {
        return isNewCustomization ? '   New' : ''
    }
}
