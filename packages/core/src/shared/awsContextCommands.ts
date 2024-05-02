/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { asString, CredentialsId } from '../auth/providers/credentials'
import * as extensionConstants from './constants'
import { UserCredentialsUtils } from './credentials/userCredentialsUtils'
import * as localizedText from './localizedText'
import { RegionProvider } from './regions/regionProvider'
import { getIdeProperties } from './extensionUtilities'
import { credentialHelpUrl } from './constants'
import { ToolkitPromptSettings } from './settings'
import { isNonNullable } from './utilities/tsUtils'
import { CreateProfileWizard } from '../auth/wizards/createProfile'
import { staticCredentialsTemplate } from '../auth/wizards/templates'
import { SharedCredentialsProvider } from '../auth/providers/sharedCredentialsProvider'
import { Auth } from '../auth/auth'
import { CancellationError } from './utilities/timeoutUtils'
import { ToolkitError } from './errors'
import { loadSharedCredentialsProfiles } from '../auth/credentials/sharedCredentials'
import { SharedCredentialsKeys } from '../auth/credentials/types'
import { openUrl } from './utilities/vsCodeUtils'

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
            (await ToolkitPromptSettings.instance.isPromptEnabled('createCredentialsProfile')) &&
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
        const existingProfiles = await loadSharedCredentialsProfiles()
        const wizard = new CreateProfileWizard(existingProfiles, staticCredentialsTemplate)
        const resp = await wizard.run()
        if (!resp) {
            return
        }

        await UserCredentialsUtils.generateCredentialsFile({
            profileName: resp.name,
            accessKey: resp.profile[SharedCredentialsKeys.AWS_ACCESS_KEY_ID]!,
            secretKey: resp.profile[SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY]!,
        })

        const sharedProviderId: CredentialsId = {
            credentialSource: SharedCredentialsProvider.getProviderType(),
            credentialTypeId: resp.name,
        }

        void vscode.window.showInformationMessage(
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
            await ToolkitPromptSettings.instance.disablePrompt('createCredentialsProfile')
        } else if (userResponse === localizedText.help) {
            await openUrl(vscode.Uri.parse(credentialHelpUrl))
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
            await openUrl(vscode.Uri.parse(extensionConstants.aboutCredentialsFileUrl))
        }
    }
}
