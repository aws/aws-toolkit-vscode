/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DevEnvironment } from '../shared/clients/codecatalystClient'
import { isCloud9 } from '../shared/extensionUtilities'
import { addColor, getIcon } from '../shared/icons'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { Commands, placeholder } from '../shared/vscode/commands2'
import { CodeCatalystAuthenticationProvider } from './auth'
import { CodeCatalystCommands } from './commands'
import { ConnectedDevEnv, getDevfileLocation, getThisDevEnv } from './model'
import * as codecatalyst from './model'
import { getLogger } from '../shared/logger'
import { Connection } from '../auth/connection'
import { openUrl } from '../shared/utilities/vsCodeUtils'
import { getShowManageConnections } from '../auth/ui/vue/show'

export const learnMoreCommand = Commands.declare('aws.learnMore', () => async (docsUrl: vscode.Uri) => {
    return openUrl(docsUrl)
})

// Only used in rare cases on C9
export const reauth = Commands.declare(
    '_aws.codecatalyst.reauthenticate',
    () => async (conn: Connection, authProvider: CodeCatalystAuthenticationProvider) => {
        await authProvider.auth.reauthenticate(conn)
    }
)

export const onboardCommand = Commands.declare(
    '_aws.codecatalyst.onboard',
    () => async (authProvider: CodeCatalystAuthenticationProvider) => {
        void authProvider.promptOnboarding()
    }
)

async function getLocalCommands(auth: CodeCatalystAuthenticationProvider) {
    const docsUrl = isCloud9() ? codecatalyst.docs.cloud9.overview : codecatalyst.docs.vscode.overview
    const learnMoreNode = learnMoreCommand.build(docsUrl).asTreeNode({
        label: 'Learn more about CodeCatalyst',
        iconPath: getIcon('vscode-question'),
    })

    // There is a connection, but it is expired, or CodeCatalyst scopes are expired.
    if (auth.activeConnection && !auth.isConnectionValid()) {
        return [
            reauth.build(auth.activeConnection, auth).asTreeNode({
                label: 'Re-authenticate to connect',
                iconPath: addColor(getIcon('vscode-debug-disconnect'), 'notificationsErrorIcon.foreground'),
            }),
            learnMoreNode,
        ]
    }

    if (!auth.activeConnection) {
        return [
            getShowManageConnections()
                .build(placeholder, 'codecatalystDeveloperTools', 'codecatalyst')
                .asTreeNode({
                    label: 'Sign in to get started',
                    iconPath: getIcon('vscode-account'),
                }),
            learnMoreNode,
        ]
    }

    // We are connected but not onboarded, so show them button to onboard
    if (!(await auth.isConnectionOnboarded(auth.activeConnection))) {
        return [
            onboardCommand.build(auth).asTreeNode({
                label: 'Onboard CodeCatalyst to get started',
                iconPath: getIcon('vscode-account'),
            }),
            learnMoreNode,
        ]
    }

    if (isCloud9()) {
        const item = reauth.build(auth.activeConnection, auth).asTreeNode({
            label: 'Failed to get the current Dev Environment. Click to try again.',
            iconPath: addColor(getIcon(`vscode-error`), 'notificationsErrorIcon.foreground'),
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

export class CodeCatalystRootNode implements TreeNode {
    public readonly id = 'codecatalyst'
    public readonly resource = this.devenv

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()

    public readonly onDidChangeVisibility = this.onDidChangeEmitter.event
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeEmitter.event

    private refreshEmitters: (() => void)[] = []

    private devenv?: ConnectedDevEnv
    private resolveDevEnv: Promise<boolean> | undefined = undefined

    public constructor(private readonly authProvider: CodeCatalystAuthenticationProvider) {
        this.addRefreshEmitter(() => this.onDidChangeEmitter.fire())

        this.authProvider.onDidChange(() => {
            this.refreshEmitters.forEach(fire => fire())
        })
    }

    public async getChildren(): Promise<TreeNode[]> {
        await this.initDevEnvLoad()

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
        await this.initDevEnvLoad()

        await this.authProvider.restore()

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
            if (this.authProvider.secondaryAuth.isConnectionExpired) {
                return 'Expired Connection'
            }
            if (this.authProvider.isBuilderIdInUse()) {
                return 'AWS Builder ID Connected'
            }
            if (this.authProvider.isEnterpriseSsoInUse()) {
                return 'IAM Identity Center Connected'
            }
        }
        return ''
    }

    public addRefreshEmitter(emitter: () => void) {
        this.refreshEmitters.push(emitter)
    }

    /**
     * CALL THIS BEFORE USING `this.devenv`
     * Ensures that the node has attempted to load the `devenv` field by
     * creating a promise that can be awaited if init has already begun and is being called elsewhere.
     */
    private async initDevEnvLoad() {
        if (this.resolveDevEnv) {
            await this.resolveDevEnv
            return
        }
        let resolve: ((val: boolean) => void) | undefined
        if (this.resolveDevEnv === undefined) {
            this.resolveDevEnv = new Promise<boolean>(res => {
                resolve = res
            })
        }

        this.devenv = (await getThisDevEnv(this.authProvider))?.unwrapOrElse(e => {
            const err = e as Error
            getLogger().warn('codecatalyst: failed to get current Dev Enviroment: %s', err.message)
            return undefined
        })
        if (resolve !== undefined) {
            resolve(true)
        }
    }
}
