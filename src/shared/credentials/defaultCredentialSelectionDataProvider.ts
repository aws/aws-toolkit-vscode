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
import { CredentialsProfileMru } from './credentialsProfileMru'
import { createLabelQuickPick } from '../ui/picker'
import { Prompter } from '../ui/prompter'
import { createInputBox } from '../ui/input'
import { Wizard } from '../wizards/wizard'
import { initializeInterface } from '../transformers'

interface ProfileEntry {
    profileName: string
    isRecentlyUsed: boolean
}

export interface CredentialSelectionDataProvider {
    existingProfileNames: string[]

    createCredentialProfilePrompter(): Prompter<string>
    createProfileNamePrompter(): Prompter<string>
    createAccessKeyPrompter(): Prompter<string> 
    createSecretKeyPrompter(): Prompter<string>
}

export interface CredentialSelectionState {
    title: string
    credentialProfile: string
    accesskey: string
    secretKey: string
    profileName: string
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

    public createCredentialProfilePrompter(): Prompter<string> {
        return createLabelQuickPick(this.getProfileSelectionList(), {
            title: localize('AWS.title.selectCredentialProfile', 'Select an AWS credential profile'),
            placeholder: localize('AWS.placeholder.selectProfile', 'Select a credential profile'),
        })
    }

    public createProfileNamePrompter(): Prompter<string> {
        return createInputBox({
            title: localize('AWS.title.createCredentialProfile', 'Create a new AWS credential profile'),
            prompt: localize('AWS.placeholder.newProfileName', 'Choose a unique name for the new profile'),
            validateInput: this.validateNameIsUnique.bind(this),
        })
    }

    public createAccessKeyPrompter(): Prompter<string> {
        return createInputBox({
            title: localize('AWS.title.createCredentialProfile', 'Create a new AWS credential profile'),
            prompt: localize('AWS.placeholder.inputAccessKey', 'Input the AWS Access Key'),
            validateInput: this.validateAccessKey.bind(this),
        })
    }

    public createSecretKeyPrompter(): Prompter<string> {
        return createInputBox({
            title: localize('AWS.title.createCredentialProfile', 'Create a new AWS credential profile'),
            prompt: localize('AWS.placeholder.inputSecretKey', 'Input the AWS Secret Key'),
            validateInput: this.validateSecretKey.bind(this),
        })
    }

    public validateNameIsUnique(name: string): string | undefined {
        const duplicate = this.existingProfileNames.find(k => k === name)

        return duplicate ? 'Name not unique' : undefined
    }

    public validateAccessKey(accessKey: string): string | undefined {
        // TODO: is there a regex pattern we could use?
        return undefined
    }

    public validateSecretKey(accessKey: string): string | undefined {
        // TODO: don't believe there is a regex but at this point we could try a 'safe' call
        return undefined
    }

    public shouldResume(): boolean {
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

export class CredentialsWizard extends Wizard<CredentialSelectionState> {
    constructor(dataProvider: CredentialSelectionDataProvider) {
        super(initializeInterface<CredentialSelectionState>())

        if (dataProvider.existingProfileNames.length !== 0) {
            this.form.credentialProfile.bindPrompter(() => dataProvider.createCredentialProfilePrompter())
        } else {
            this.form.profileName.bindPrompter(() => dataProvider.createProfileNamePrompter())
            this.form.accesskey.bindPrompter(() => dataProvider.createAccessKeyPrompter())
            this.form.secretKey.bindPrompter(() => dataProvider.createSecretKeyPrompter())
        }
    }
}