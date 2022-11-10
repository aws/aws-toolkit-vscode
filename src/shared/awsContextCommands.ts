/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { asString, CredentialsId } from '../credentials/providers/credentials'
import * as extensionConstants from './constants'
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
import { Auth } from '../credentials/auth'
import { CancellationError } from './utilities/timeoutUtils'
import { ToolkitError } from './errors'

/**
 * @deprecated
 */
export class AwsContextCommands {
    private readonly _regionProvider: RegionProvider

    public constructor(regionProvider: RegionProvider, private readonly auth: Auth) {
        this._regionProvider = regionProvider
    }

    public async onCommandCreateCredentialsProfile(): Promise<void> {
        // Help user make a new credentials profile
        const profileName: string | undefined = await this.promptAndCreateNewCredentialsFile()

        if (profileName) {
            const conn = await this.auth.getConnection({ id: profileName })
            if (conn === undefined) {
                throw new ToolkitError('Failed to get connection from profile', { code: 'MissingConnection' })
            }

            await this.auth.useConnection(conn)
            await this.editCredentials()
        } else {
            throw new CancellationError('user')
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
    public async promptAndCreateNewCredentialsFile(): Promise<string | undefined> {
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
    public async editCredentials(): Promise<void> {
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
