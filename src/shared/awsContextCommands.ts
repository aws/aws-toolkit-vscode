/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from './extensionGlobals'

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { LoginManager } from '../credentials/loginManager'
import { asString, CredentialsId, fromString } from '../credentials/providers/credentials'
import { CredentialsProviderManager } from '../credentials/providers/credentialsProviderManager'
import * as extensionConstants from './constants'
import {
    credentialProfileSelector,
    DefaultCredentialSelectionDataProvider,
} from './credentials/defaultCredentialSelectionDataProvider'
import { UserCredentialsUtils } from './credentials/userCredentialsUtils'
import * as localizedText from './localizedText'
import { RegionProvider } from './regions/regionProvider'
import { getIdeProperties } from './extensionUtilities'
import { credentialHelpUrl } from './constants'
import { PromptSettings } from './settings'
import { isNonNullable } from './utilities/tsUtils'
import { loadSharedCredentialsProfiles } from '../credentials/sharedCredentials'
import { CreateProfileWizard } from '../credentials/wizards/createProfile'
import { Profile } from './credentials/credentialsFile'
import { ProfileKey, staticCredentialsTemplate } from '../credentials/wizards/templates'
import { SharedCredentialsProvider } from '../credentials/providers/sharedCredentialsProvider'

/**
 * @deprecated
 */
export class AwsContextCommands {
    private readonly _regionProvider: RegionProvider

    public constructor(regionProvider: RegionProvider, private readonly loginManager: LoginManager) {
        this._regionProvider = regionProvider
    }

    public async onCommandLogin() {
        const profileName = await this.getProfileNameFromUser()
        if (!profileName) {
            // user clicked away from quick pick or entered nothing
            return
        }

        await this.loginManager.login({ passive: false, providerId: fromString(profileName) })
    }

    public async onCommandCreateCredentialsProfile(): Promise<void> {
        // Help user make a new credentials profile
        const profileName: string | undefined = await this.promptAndCreateNewCredentialsFile()

        if (profileName) {
            await this.loginManager.login({ passive: false, providerId: fromString(profileName) })
            await this.editCredentials()
        }
    }

    public async onCommandEditCredentials(): Promise<void> {
        const credentialsFiles = await UserCredentialsUtils.findExistingCredentialsFilenames()
        if (credentialsFiles.length === 0) {
            await UserCredentialsUtils.generateCredentialsFile()
        }

        await this.editCredentials()
        if (
            credentialsFiles.length === 0 &&
            (await PromptSettings.instance.isPromptEnabled('createCredentialsProfile')) &&
            (await this.promptCredentialsSetup())
        ) {
            await this.onCommandCreateCredentialsProfile()
        }
    }

    public async onCommandLogout() {
        await this.loginManager.logout()
    }

    public async onCommandShowRegion() {
        const window = vscode.window
        const currentRegions = new Set(this._regionProvider.getExplorerRegions())
        // All regions (in the current partition).
        const allRegions = this._regionProvider.getRegions()

        const items: vscode.QuickPickItem[] = []
        for (const r of allRegions) {
            items.push({
                label: r.name,
                detail: r.id, //
                picked: currentRegions ? currentRegions.has(r.id) : false,
            })
        }

        // const title = localize('aws.showHideRegionTitle', 'Show or hide regions in {0} Toolkit', getIdeProperties().company),
        const placeholder = localize(
            'aws.showHideRegionPlaceholder',
            'Select regions to show (unselect to hide)',
            getIdeProperties().company
        )
        const result = await window.showQuickPick(items, {
            // title: title,
            placeHolder: placeholder,
            canPickMany: true,
            matchOnDetail: true,
        })

        if (!result) {
            return false // User canceled.
        }

        const selected = result.map(res => res.detail).filter(isNonNullable)
        if (selected.length !== currentRegions.size || selected.some(r => !currentRegions.has(r))) {
            await this._regionProvider.updateExplorerRegions(selected)
            await vscode.commands.executeCommand('aws.refreshAwsExplorer', true)
        }

        return true
    }

    /**
     * @description Ask user for credentials information, store
     * it in new credentials file.
     *
     * @returns The profile name, or undefined if user cancelled
     */
    private async promptAndCreateNewCredentialsFile(): Promise<string | undefined> {
        const profiles = {} as Record<string, Profile>
        for (const [k, v] of (await loadSharedCredentialsProfiles()).entries()) {
            profiles[k] = v
        }

        const wizard = new CreateProfileWizard(profiles, staticCredentialsTemplate)
        const resp = await wizard.run()
        if (!resp) {
            return
        }

        await UserCredentialsUtils.generateCredentialsFile({
            profileName: resp.name,
            accessKey: resp.profile[ProfileKey.AccessKeyId]!,
            secretKey: resp.profile[ProfileKey.SecretKey]!,
        })

        const sharedProviderId: CredentialsId = {
            credentialSource: SharedCredentialsProvider.getProviderType(),
            credentialTypeId: resp.name,
        }

        vscode.window.showInformationMessage(
            localize(
                'AWS.message.prompt.credentials.definition.done',
                'Created {0} credentials profile: {1}',
                getIdeProperties().company,
                resp.name
            )
        )

        return asString(sharedProviderId)
    }

    /**
     * Gets a profile from the user, or runs "Create Credentials" command if there are no profiles.
     *
     * @returns User's selected Profile name, or undefined if none was selected.
     * undefined is also returned if we leave the user in a state where they are
     * editing their credentials file.
     */
    private async getProfileNameFromUser(): Promise<string | undefined> {
        const credentialsFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
        const providerMap = await CredentialsProviderManager.getInstance().getCredentialProviderNames()
        const profileNames = Object.keys(providerMap)
        if (profileNames.length > 0) {
            // There are credentials for the user to choose from
            const dataProvider = new DefaultCredentialSelectionDataProvider(profileNames, globals.context)
            const state = await credentialProfileSelector(dataProvider)
            if (state && state.credentialProfile) {
                return state.credentialProfile.label
            }
        } else if (credentialsFiles.length === 0) {
            return await this.promptAndCreateNewCredentialsFile()
        } else {
            await this.editCredentials()
        }
        return undefined
    }

    private async promptCredentialsSetup(): Promise<boolean> {
        // If no credentials were found, the user should be
        // encouraged to define some.
        const userResponse = await vscode.window.showInformationMessage(
            localize(
                'AWS.message.prompt.credentials.create',
                'No {0} credentials found. Create one now?',
                getIdeProperties().company
            ),
            localizedText.yes,
            localizedText.no,
            localizedText.help
        )

        if (userResponse === localizedText.yes) {
            return true
        } else if (userResponse === localizedText.no) {
            PromptSettings.instance.disablePrompt('createCredentialsProfile')
        } else if (userResponse === localizedText.help) {
            vscode.env.openExternal(vscode.Uri.parse(credentialHelpUrl))
            return await this.promptCredentialsSetup()
        }

        return false
    }

    /**
     * @description Sets the user up to edit the credentials files.
     */
    private async editCredentials(): Promise<void> {
        const credentialsFiles: string[] = await UserCredentialsUtils.findExistingCredentialsFilenames()
        let preserveFocus: boolean = false
        let viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active

        for (const filename of credentialsFiles) {
            await vscode.window.showTextDocument(vscode.Uri.file(filename), {
                preserveFocus: preserveFocus,
                preview: false,
                viewColumn: viewColumn,
            })

            preserveFocus = true
            viewColumn = vscode.ViewColumn.Beside
        }

        const response = await vscode.window.showInformationMessage(
            localize(
                'AWS.message.prompt.credentials.definition.help',
                'Editing an {0} credentials file.',
                getIdeProperties().company
            ),
            localizedText.viewDocs
        )

        if (response && response === localizedText.viewDocs) {
            await vscode.env.openExternal(vscode.Uri.parse(extensionConstants.aboutCredentialsFileUrl))
        }
    }
}
