/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Implements a multi-step capable selector for traditional AWS credential profiles
// (access key/secret key based) for with the ability for users to add new credential
// profiles. As other sign-in mechanisms become available in the future, we should be
// able to extend this selector to handle them quite easily. The handler currently
// returns the name of the selected or created credential profile.
//
// Based on the multiStepInput code in the QuickInput VSCode extension sample.

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { ExtensionContext, QuickPickItem } from 'vscode'
import { asString } from '../../credentials/providers/credentialsProviderId'
import { SharedCredentialsProvider } from '../../credentials/providers/sharedCredentialsProvider'
import { MultiStepInputFlowController } from '../multiStepInputFlowController'
import { CredentialSelectionDataProvider } from './credentialSelectionDataProvider'
import { CredentialSelectionState } from './credentialSelectionState'
import { CredentialsProfileMru } from './credentialsProfileMru'
import { getIdeProperties } from '../extensionUtilities'

interface ProfileEntry {
    profileName: string
    isRecentlyUsed: boolean
}

export class DefaultCredentialSelectionDataProvider implements CredentialSelectionDataProvider {
    private static readonly defaultCredentialsProfileName = asString({
        credentialType: SharedCredentialsProvider.getCredentialsType(),
        credentialTypeId: 'default',
    })

    private readonly _credentialsMru: CredentialsProfileMru

    public constructor(public readonly existingProfileNames: string[], protected context: ExtensionContext) {
        this._credentialsMru = new CredentialsProfileMru(context)
    }

    public async pickCredentialProfile(
        input: MultiStepInputFlowController,
        state: Partial<CredentialSelectionState>
    ): Promise<QuickPickItem> {
        return await input.showQuickPick({
            title: localize('AWS.title.selectCredentialProfile', 'Select an {0} credential profile', getIdeProperties().company),
            step: 1,
            totalSteps: 1,
            placeholder: localize('AWS.placeHolder.selectProfile', 'Select a credential profile'),
            items: this.getProfileSelectionList(),
            activeItem: state.credentialProfile,
            shouldResume: this.shouldResume.bind(this),
        })
    }

    public async inputProfileName(
        input: MultiStepInputFlowController,
        state: Partial<CredentialSelectionState>
    ): Promise<string | undefined> {
        return await input.showInputBox({
            title: localize('AWS.title.createCredentialProfile', 'Create a new {0} credential profile', getIdeProperties().company),
            step: 1,
            totalSteps: 3,
            value: '',
            prompt: localize('AWS.placeHolder.newProfileName', 'Choose a unique name for the new profile'),
            validate: this.validateNameIsUnique.bind(this),
            shouldResume: this.shouldResume.bind(this),
        })
    }

    public async inputAccessKey(
        input: MultiStepInputFlowController,
        state: Partial<CredentialSelectionState>
    ): Promise<string | undefined> {
        return await input.showInputBox({
            title: localize('AWS.title.createCredentialProfile', 'Create a new {0} credential profile', getIdeProperties().company),
            step: 2,
            totalSteps: 3,
            value: '',
            prompt: localize('AWS.placeHolder.inputAccessKey', 'Input the {0} Access Key', getIdeProperties().company),
            validate: this.validateAccessKey.bind(this),
            ignoreFocusOut: true,
            shouldResume: this.shouldResume.bind(this),
        })
    }

    public async inputSecretKey(
        input: MultiStepInputFlowController,
        state: Partial<CredentialSelectionState>
    ): Promise<string | undefined> {
        return await input.showInputBox({
            title: localize('AWS.title.createCredentialProfile', 'Create a new {0} credential profile', getIdeProperties().company),
            step: 3,
            totalSteps: 3,
            value: '',
            prompt: localize('AWS.placeHolder.inputSecretKey', 'Input the {0} Secret Key', getIdeProperties().company),
            validate: this.validateSecretKey.bind(this),
            ignoreFocusOut: true,
            shouldResume: this.shouldResume.bind(this),
        })
    }

    public async validateNameIsUnique(name: string): Promise<string | undefined> {
        const duplicate = this.existingProfileNames.find(k => k === name)

        return duplicate ? 'Name not unique' : undefined
    }

    public async validateAccessKey(accessKey: string): Promise<string | undefined> {
        // TODO: is there a regex pattern we could use?
        return undefined
    }

    public async validateSecretKey(accessKey: string): Promise<string | undefined> {
        // TODO: don't believe there is a regex but at this point we could try a 'safe' call
        return undefined
    }

    public async shouldResume(): Promise<boolean> {
        // Could show a notification with the option to resume.
        return false
    }

    /**
     * Builds and returns the list of QuickPickItem objects representing the profile names to select from in the UI
     */
    private getProfileSelectionList(): QuickPickItem[] {
        const orderedProfiles: ProfileEntry[] = this.getOrderedProfiles()

        const selectionList: QuickPickItem[] = []
        orderedProfiles.forEach(profile => {
            const selectionItem: QuickPickItem = { label: profile.profileName }

            if (profile.isRecentlyUsed) {
                selectionItem.description = localize('AWS.profile.recentlyUsed', 'recently used')
            }

            selectionList.push(selectionItem)
        })

        return selectionList
    }

    /**
     * Returns a list of profiles, and whether or not they have been
     * used recently. Ordered by: MRU, default, all others
     */
    private getOrderedProfiles(): ProfileEntry[] {
        const mostRecentProfileNames = this.getMostRecentlyUsedProfileNames()

        const orderedProfiles: ProfileEntry[] = []
        const orderedNames = new Set()

        // Add MRU entries first
        mostRecentProfileNames.forEach(profileName => {
            orderedProfiles.push({ profileName: profileName, isRecentlyUsed: true })
            orderedNames.add(profileName)
        })

        // Add default if it hasn't been, and is an existing profile name
        const defaultProfileName = DefaultCredentialSelectionDataProvider.defaultCredentialsProfileName
        if (!orderedNames.has(defaultProfileName) && this.existingProfileNames.includes(defaultProfileName)) {
            orderedProfiles.push({ profileName: defaultProfileName, isRecentlyUsed: false })
            orderedNames.add(DefaultCredentialSelectionDataProvider.defaultCredentialsProfileName)
        }

        // Add remaining items, sorted alphanumerically
        const remainingProfiles: ProfileEntry[] = this.existingProfileNames
            .filter(x => !orderedNames.has(x))
            .sort()
            .map(profileName => ({ profileName: profileName, isRecentlyUsed: false }))
        orderedProfiles.push(...remainingProfiles)

        return orderedProfiles
    }

    /**
     * Returns a list of the profile names that are currently in the MRU list
     */
    private getMostRecentlyUsedProfileNames(): string[] {
        const mru = this._credentialsMru.getMruList()

        return mru.filter(x => this.existingProfileNames.includes(x))
    }
}

export async function credentialProfileSelector(
    dataProvider: CredentialSelectionDataProvider
): Promise<CredentialSelectionState | undefined> {
    async function pickCredentialProfile(
        input: MultiStepInputFlowController,
        state: Partial<CredentialSelectionState>
    ) {
        state.credentialProfile = await dataProvider.pickCredentialProfile(input, state)
    }

    async function collectInputs() {
        const state: Partial<CredentialSelectionState> = {}
        await MultiStepInputFlowController.run(async input => await pickCredentialProfile(input, state))

        return state as CredentialSelectionState
    }

    return await collectInputs()
}

export async function promptToDefineCredentialsProfile(
    dataProvider: CredentialSelectionDataProvider
): Promise<CredentialSelectionState> {
    async function inputProfileName(input: MultiStepInputFlowController, state: Partial<CredentialSelectionState>) {
        state.profileName = await dataProvider.inputProfileName(input, state)

        /* tslint:disable promise-function-async */
        return (inputController: MultiStepInputFlowController) => inputAccessKey(inputController, state)
        /* tslint:enable promise-function-async */
    }

    async function inputAccessKey(input: MultiStepInputFlowController, state: Partial<CredentialSelectionState>) {
        state.accesskey = await dataProvider.inputAccessKey(input, state)

        /* tslint:disable promise-function-async */
        return (inputController: MultiStepInputFlowController) => inputSecretKey(inputController, state)
        /* tslint:enable promise-function-async */
    }

    async function inputSecretKey(input: MultiStepInputFlowController, state: Partial<CredentialSelectionState>) {
        state.secretKey = await dataProvider.inputSecretKey(input, state)
    }

    async function collectInputs(): Promise<CredentialSelectionState> {
        const state: Partial<CredentialSelectionState> = {}
        /* tslint:disable promise-function-async */
        await MultiStepInputFlowController.run(input => inputProfileName(input, state))
        /* tslint:enable promise-function-async */

        return state as CredentialSelectionState
    }

    return await collectInputs()
}
