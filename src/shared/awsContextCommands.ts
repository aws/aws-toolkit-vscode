/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { LoginManager } from '../credentials/loginManager'
import { asString, CredentialsId, fromString } from '../credentials/providers/credentials'
import { CredentialsProviderManager } from '../credentials/providers/credentialsProviderManager'
import { AwsContext } from './awsContext'
import { AwsContextTreeCollection } from './awsContextTreeCollection'
import * as extensionConstants from './constants'
import { CredentialSelectionState } from './credentials/credentialSelectionState'
import {
    credentialProfileSelector,
    DefaultCredentialSelectionDataProvider,
    promptToDefineCredentialsProfile,
} from './credentials/defaultCredentialSelectionDataProvider'
import { UserCredentialsUtils } from './credentials/userCredentialsUtils'
import * as localizedText from './localizedText'
import { RegionProvider } from './regions/regionProvider'
import { getRegionsForActiveCredentials } from './regions/regionUtilities'
import { SharedCredentialsProvider } from '../credentials/providers/sharedCredentialsProvider'
import { getIdeProperties } from './extensionUtilities'
import { credentialHelpUrl } from './constants'
import { showViewLogsMessage } from './utilities/messages'
import globals from './extensionGlobals'
import { DefaultStsClient } from './clients/stsClient'
import { getLogger } from './logger/logger'
import { PromptSettings } from './settings'

/**
 * @deprecated
 */
export class AwsContextCommands {
    private readonly _awsContext: AwsContext
    private readonly _awsContextTrees: AwsContextTreeCollection
    private readonly _regionProvider: RegionProvider

    public constructor(
        awsContext: AwsContext,
        awsContextTrees: AwsContextTreeCollection,
        regionProvider: RegionProvider,
        private readonly loginManager: LoginManager
    ) {
        this._awsContext = awsContext
        this._awsContextTrees = awsContextTrees
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
        const currentRegionsList = await this._awsContext.getExplorerRegions()
        const currentRegions = new Set(currentRegionsList)
        // All regions (in the current partition).
        const allRegions = getRegionsForActiveCredentials(this._awsContext, this._regionProvider)

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

        const selected = new Set(result.map(res => res.detail))
        const addedRegions = result.filter(o => !!o.detail && !currentRegions.has(o.detail)).map(o => o.detail ?? '')
        const removedRegions = currentRegionsList.filter(o => !selected.has(o))

        if (addedRegions.length > 0) {
            await this._awsContext.addExplorerRegion(...addedRegions.values())
        }

        if (removedRegions.length > 0) {
            await this._awsContext.removeExplorerRegion(...removedRegions.values())
        }

        if (addedRegions.length > 0 || removedRegions.length > 0) {
            this.refresh()
        }

        return true
    }

    private refresh() {
        this._awsContextTrees.refreshTrees()
    }

    /**
     * @description Ask user for credentials information, store
     * it in new credentials file.
     *
     * @returns The profile name, or undefined if user cancelled
     */
    private async promptAndCreateNewCredentialsFile(): Promise<string | undefined> {
        while (true) {
            const dataProvider = new DefaultCredentialSelectionDataProvider([], globals.context)
            const state: CredentialSelectionState = await promptToDefineCredentialsProfile(dataProvider)

            if (!state.profileName || !state.accesskey || !state.secretKey) {
                return undefined
            }

            // TODO : Get a region relevant to the partition for these credentials -- https://github.com/aws/aws-toolkit-vscode/issues/188
            const client = new DefaultStsClient('us-east-1', {
                accessKeyId: state.accesskey,
                secretAccessKey: state.secretKey,
            })
            const accountId = await client.getCallerIdentity().catch(err => {
                getLogger().error(`credentials: failed to get account id: ${(err as Error).message}`)
            })

            if (accountId) {
                await UserCredentialsUtils.generateCredentialDirectoryIfNonexistent()
                await UserCredentialsUtils.generateCredentialsFile({
                    profileName: state.profileName,
                    accessKey: state.accesskey,
                    secretKey: state.secretKey,
                })

                const sharedProviderId: CredentialsId = {
                    credentialSource: SharedCredentialsProvider.getProviderType(),
                    credentialTypeId: state.profileName,
                }

                vscode.window.showInformationMessage(
                    localize(
                        'AWS.message.prompt.credentials.definition.done',
                        'Created {0} credentials profile: {1}',
                        getIdeProperties().company,
                        state.profileName
                    )
                )

                return asString(sharedProviderId)
            }

            const response = await showViewLogsMessage(
                localize(
                    'AWS.message.prompt.credentials.definition.tryAgain',
                    '{0} credentials appear invalid. Try again?',
                    getIdeProperties().company
                ),
                globals.window,
                'warn',
                [localizedText.yes, localizedText.no]
            )

            if (!response || response !== localizedText.yes) {
                return undefined
            }
        } // Keep asking until cancel or valid credentials are entered
    }

    /**
     * @description Responsible for getting a profile from the user,
     * working with them to define one if necessary.
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
            if (await this.promptCredentialsSetup()) {
                return await this.promptAndCreateNewCredentialsFile()
            }
        } else {
            if (await this.promptCredentialsSetup()) {
                await this.editCredentials()
            }
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
