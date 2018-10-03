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

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { ExtensionContext, QuickPickItem, Uri } from 'vscode'
import { extensionSettingsPrefix } from '../constants'
import { MultiStepInputFlowController } from '../multiStepInputFlowController'
import { DefaultSettingsConfiguration } from '../settingsConfiguration'
import { AddProfileButton, CredentialSelectionDataProvider } from './credentialSelectionDataProvider'
import { CredentialSelectionState } from './credentialSelectionState'
import { CredentialsProfileMru } from './credentialsProfileMru'

interface ProfileEntry {
    profileName: string,
    isRecentlyUsed: boolean,
}

export class DefaultCredentialSelectionDataProvider implements CredentialSelectionDataProvider {

    private static readonly defaultCredentialsProfileName: string = 'default'
    private readonly _credentialsMru: CredentialsProfileMru =
        new CredentialsProfileMru(new DefaultSettingsConfiguration(extensionSettingsPrefix))
    private readonly _newProfileButton: AddProfileButton

    public constructor(public readonly existingProfileNames: string[], protected context: ExtensionContext) {
        this._newProfileButton = new AddProfileButton(
            {
                dark: Uri.file(context.asAbsolutePath('resources/dark/add.svg')),
                light: Uri.file(context.asAbsolutePath('resources/light/add.svg')),
            },
            localize('AWS.tooltip.createCredentialProfile', 'Create a new credential profile')
        )
    }

    public async pickCredentialProfile(
        input: MultiStepInputFlowController,
        state: Partial<CredentialSelectionState>
    ): Promise<QuickPickItem | AddProfileButton> {
        return await input.showQuickPick({
            title: localize('AWS.title.selectCredentialProfile', 'Select an AWS credential profile'),
            step: 1,
            totalSteps: 1,
            placeholder: localize('AWS.placeHolder.selectProfile', 'Select a credential profile'),
            items: this.getProfileSelectionList(),
            activeItem: state.credentialProfile,
            buttons: [this._newProfileButton],
            shouldResume: this.shouldResume
        })
    }

    public async inputProfileName(
        input: MultiStepInputFlowController,
        state: Partial<CredentialSelectionState>
    ): Promise<string | undefined> {
        return await input.showInputBox({
            title: localize('AWS.title.createCredentialProfile', 'Create a new AWS credential profile'),
            step: 1,
            totalSteps: 3,
            value: '',
            prompt: localize('AWS.placeHolder.newProfileName', 'Choose a unique name for the new profile'),
            validate: this.validateNameIsUnique,
            shouldResume: this.shouldResume
        })
    }

    public async inputAccessKey(
        input: MultiStepInputFlowController,
        state: Partial<CredentialSelectionState>
    ): Promise<string | undefined> {
        return await input.showInputBox({
            title: localize('AWS.title.createCredentialProfile', 'Create a new AWS credential profile'),
            step: 2,
            totalSteps: 3,
            value: '',
            prompt: localize('AWS.placeHolder.inputAccessKey', 'Input the AWS Access Key'),
            validate: this.validateAccessKey,
            ignoreFocusOut: true,
            shouldResume: this.shouldResume
        })
    }

    public async inputSecretKey(
        input: MultiStepInputFlowController,
        state: Partial<CredentialSelectionState>
    ): Promise<string | undefined> {
        return await input.showInputBox({
            title: localize('AWS.title.createCredentialProfile', 'Create a new AWS credential profile'),
            step: 3,
            totalSteps: 3,
            value: '',
            prompt: localize('AWS.placeHolder.inputSecretKey', 'Input the AWS Secret Key'),
            validate: this.validateSecretKey,
            ignoreFocusOut: true,
            shouldResume: this.shouldResume
        })
    }

    public validateNameIsUnique = (name: string): Promise<string | undefined> => {
        return new Promise<string | undefined>(resolve => {
            const duplicate = this.existingProfileNames.find(k => k === name)
            resolve(duplicate ? 'Name not unique' : undefined)
        })
    }

    public validateAccessKey = (accessKey: string): Promise<string | undefined> => {
        // TODO: is there a regex pattern we could use?
        return new Promise<string | undefined>(resolve => resolve(undefined))
    }

    public validateSecretKey = (accessKey: string): Promise<string | undefined> => {
        // TODO: don't believe there is a regex but at this point we could try a 'safe' call
        return new Promise<string | undefined>(resolve => resolve(undefined))
    }

    public shouldResume = (): Promise<boolean> => {
        // Could show a notification with the option to resume.
        return new Promise<boolean>((resolve, reject) => {
        })
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
        if (!orderedNames.has(defaultProfileName) && this.existingProfileNames.indexOf(defaultProfileName) !== -1) {
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

        return mru.filter(x => this.existingProfileNames.indexOf(x) !== -1)
    }
}

export async function credentialProfileSelector(
    dataProvider: CredentialSelectionDataProvider
): Promise<CredentialSelectionState | undefined> {

    async function pickCredentialProfile(
        input: MultiStepInputFlowController,
        state: Partial<CredentialSelectionState>
    ) {
        const pick = await dataProvider.pickCredentialProfile(input, state)
        if (pick instanceof AddProfileButton) {
            return (inputController: MultiStepInputFlowController) => inputProfileName(inputController, state)
        }
        state.credentialProfile = pick
    }

    async function inputProfileName(input: MultiStepInputFlowController, state: Partial<CredentialSelectionState>) {
        state.profileName = await dataProvider.inputProfileName(input, state)

        return (inputController: MultiStepInputFlowController) => inputAccessKey(inputController, state)
    }

    async function inputAccessKey(input: MultiStepInputFlowController, state: Partial<CredentialSelectionState>) {
        state.accesskey = await dataProvider.inputAccessKey(input, state)

        return (inputController: MultiStepInputFlowController) => inputSecretKey(inputController, state)
    }

    async function inputSecretKey(input: MultiStepInputFlowController, state: Partial<CredentialSelectionState>) {
        state.secretKey = await dataProvider.inputSecretKey(input, state)
    }

    async function collectInputs() {
        const state: Partial<CredentialSelectionState> = {}
        await MultiStepInputFlowController.run(input => pickCredentialProfile(input, state))

        return state as CredentialSelectionState
    }

    return await collectInputs()
}
