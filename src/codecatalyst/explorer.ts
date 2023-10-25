/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RootNode } from '../awsexplorer/localExplorer'
import { DevEnvironment } from '../shared/clients/codecatalystClient'
import { isCloud9 } from '../shared/extensionUtilities'
import { addColor, getIcon } from '../shared/icons'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { Commands } from '../shared/vscode/commands2'
import { CodeCatalystAuthenticationProvider } from './auth'
import { CodeCatalystCommands } from './commands'
import { ConnectedDevEnv, getDevfileLocation, getThisDevEnv } from './model'
import * as codecatalyst from './model'
import { getLogger } from '../shared/logger'
import { Connection, isBuilderIdConnection } from '../auth/connection'
import { openUrl } from '../shared/utilities/vsCodeUtils'
import { AuthCommandDeclarations } from '../auth/commands'

const learnMoreCommand = Commands.register('aws.learnMore', async (docsUrl: vscode.Uri) => {
    return openUrl(docsUrl)
})

// Only used in rare cases on C9
const reauth = Commands.register(
    '_aws.codecatalyst.reauthenticate',
    async (conn: Connection, authProvider: CodeCatalystAuthenticationProvider) => {
        await authProvider.auth.reauthenticate(conn)
    }
)

async function getLocalCommands(auth: CodeCatalystAuthenticationProvider) {
    const docsUrl = isCloud9() ? codecatalyst.docs.cloud9.overview : codecatalyst.docs.vscode.overview
    if (!isBuilderIdConnection(auth.activeConnection) || !(await auth.isConnectionOnboarded(auth.activeConnection))) {
        return [
            AuthCommandDeclarations.instance.declared.showManageConnections
                .build('codecatalystDeveloperTools', 'codecatalyst')
                .asTreeNode({
                    label: 'Start',
                    iconPath: getIcon('vscode-debug-start'),
                }),
            learnMoreCommand.build(docsUrl).asTreeNode({
                label: 'Learn More about CodeCatalyst',
                iconPath: getIcon('vscode-question'),
            }),
        ]
    }

    if (isCloud9()) {
        const item = reauth.build(auth.activeConnection, auth).asTreeNode({
            label: 'Failed to get the current Dev Environment. Click to try again.',
            iconPath: getIcon(`vscode-error`),
        })

        return [item]
    }

    return [
        CodeCatalystCommands.declared.cloneRepo.build().asTreeNode({
            label: 'Clone Repository',
            iconPath: getIcon('vscode-symbol-namespace'),
        }),
        CodeCatalystCommands.declared.openDevEnv.build().asTreeNode({
            label: 'Open Dev Environment',
            iconPath: getIcon('vscode-vm-connect'),
        }),
        CodeCatalystCommands.declared.createDevEnv.build().asTreeNode({
            label: 'Create Dev Environment',
            iconPath: getIcon('vscode-add'),
        }),
        CodeCatalystCommands.declared.listCommands.build().asTreeNode({
            label: 'Show CodeCatalyst Commands',
            iconPath: getIcon('vscode-list-flat'), // TODO(sijaden): use better icon
        }),
    ]
}

function getRemoteCommands(currentDevEnv: DevEnvironment, devfileLocation: vscode.Uri) {
    return [
        CodeCatalystCommands.declared.stopDevEnv.build(currentDevEnv, { showPrompt: true }).asTreeNode({
            label: 'Stop Dev Environment',
            iconPath: getIcon('vscode-stop-circle'),
        }),
        CodeCatalystCommands.declared.openDevEnvSettings.build().asTreeNode({
            label: 'Open Settings',
            iconPath: getIcon('vscode-settings-gear'),
        }),
        CodeCatalystCommands.declared.openDevfile.build(devfileLocation).asTreeNode({
            label: 'Open Devfile',
            iconPath: getIcon('vscode-symbol-namespace'),
            description: vscode.workspace.asRelativePath(devfileLocation),
        }),
    ]
}

export class CodeCatalystRootNode implements RootNode {
    public readonly id = 'codecatalyst'
    public readonly resource = this.devenv

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()

    public readonly onDidChangeVisibility = this.onDidChangeEmitter.event
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeEmitter.event

    private devenv?: ConnectedDevEnv

    public constructor(private readonly authProvider: CodeCatalystAuthenticationProvider) {
        this.authProvider.onDidChangeActiveConnection(() => this.onDidChangeEmitter.fire())
    }

    public async getChildren(): Promise<TreeNode[]> {
        if (!this.devenv) {
            return getLocalCommands(this.authProvider)
        }

        const devfileLocation = await getDevfileLocation(this.devenv.devenvClient)

        return getRemoteCommands(this.devenv.summary, devfileLocation)
    }

    /**
     * HACK: Since this is assumed to be an immediate child of the
     * root, we return undefined.
     *
     * TODO: Look to have a base root class to extend so we do not
     * need to implement this here.
     * @returns
     */
    getParent(): TreeNode<unknown> | undefined {
        return undefined
    }

    public async getTreeItem() {
        await this.authProvider.restore()

        this.devenv = (await getThisDevEnv(this.authProvider))?.unwrapOrElse(err => {
            getLogger().warn('codecatalyst: failed to get current Dev Enviroment: %s', err)
            return undefined
        })

        const item = new vscode.TreeItem('CodeCatalyst', vscode.TreeItemCollapsibleState.Collapsed)
        item.contextValue = this.authProvider.isUsingSavedConnection
            ? 'awsCodeCatalystNodeSaved'
            : 'awsCodeCatalystNode'

        if (this.devenv !== undefined) {
            item.description = 'Connected to Dev Environment'
            item.iconPath = addColor(getIcon('vscode-pass'), 'testing.iconPassed')
        } else {
            item.description = this.getDescription()
        }

        return item
    }

    private getDescription(): string {
        if (this.authProvider.activeConnection) {
            return this.authProvider.secondaryAuth.isConnectionExpired
                ? 'Expired Connection'
                : 'AWS Builder ID Connected'
        }
        return ''
    }
}
