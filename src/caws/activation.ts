/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as caws from '../shared/clients/cawsClient'
import { ext } from '../shared/extensionGlobals'
import { ExtContext, VSCODE_EXTENSION_ID } from '../shared/extensions'
import { createHelpButton } from '../shared/ui/buttons'
import * as pickerLib from '../shared/ui/picker'
import { IteratorTransformer } from '../shared/utilities/collectionUtils'
import { activateExtension, localize } from '../shared/utilities/vsCodeUtils'
import * as cawsView from './cawsView'
import * as msg from '../shared/utilities/messages'
import { ContextChangeEventsArgs } from '../shared/awsContext'
import { GitExtension } from '../../types/git'
import { CawsRemoteSourceProvider } from './repos/remoteSourceProvider'
import { getLogger } from '../shared/logger/logger'

/**
 * Activate CAWS functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    const viewProvider = new cawsView.CawsView()
    const view = vscode.window.createTreeView(viewProvider.viewId, {
        treeDataProvider: viewProvider,
        showCollapseAll: true,
    })

    ext.context.subscriptions.push(
        // vscode.window.registerTreeDataProvider(viewProvider.viewId, viewProvider),
        view,
        ext.awsContext.onDidChangeContext(async e => {
            onCredentialsChanged(ctx.extensionContext, viewProvider, view, e)
        })
    )

    // Git Extension handling
    activateExtension<GitExtension>(VSCODE_EXTENSION_ID.git).then(extension => {
        if (extension) {
            handleGitExtension(extension)
        } else {
            getLogger().warn('Git Extension could not be activated.')
        }
    })

    await registerCommands(ctx)
}

function handleGitExtension(extension: vscode.Extension<GitExtension>): void {
    let currDisposable: vscode.Disposable | undefined

    // TODO: Add user initialization outside git extension activation
    let initialUser: string | undefined
    try {
        initialUser = ext.caws.user()
    } catch {
        // swallow error: no user set
    }
    currDisposable = makeNewRemoteSourceProvider(extension, initialUser)

    ext.context.subscriptions.push(
        ext.awsContext.onDidChangeContext(c => {
            if (currDisposable) {
                currDisposable.dispose()
            }
            if (c.cawsUsername && c.cawsSecret) {
                currDisposable = makeNewRemoteSourceProvider(extension, c.cawsUsername)
            } else {
                currDisposable = makeNewRemoteSourceProvider(extension)
            }
        })
    )
}

function makeNewRemoteSourceProvider(extension: vscode.Extension<GitExtension>, uname?: string): vscode.Disposable {
    const API_VERSION = 1
    const API = extension.exports.getAPI(API_VERSION)
    return API.registerRemoteSourceProvider(new CawsRemoteSourceProvider(uname))
}

async function onCredentialsChanged(
    ctx: vscode.ExtensionContext,
    viewProvider: cawsView.CawsView,
    view: vscode.TreeView<unknown>,
    e: ContextChangeEventsArgs
) {
    view.title = e.cawsUsername ? `CODE.AWS (${e.cawsUsername})` : 'CODE.AWS'
    await ext.caws.onCredentialsChanged(e.cawsUsername ?? '', e.cawsSecret ?? '')

    // vscode secrets API is only available in newer versions.
    if (e.cawsUsername && e.cawsSecret && (ctx as any).secrets) {
        // This sets the OS keychain item "vscodeamazonwebservices.aws:caws/$user".
        ;(ctx as any).secrets.store(`caws/${e.cawsUsername}`, e.cawsSecret)
    }

    viewProvider.refresh()
}

async function registerCommands(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.caws.connect', async () => await cawsConnect()),
        vscode.commands.registerCommand('aws.caws.logout', async () => await cawsLogout()),
        vscode.commands.registerCommand('aws.caws.openOrg', async () => await openCawsResource('org')),
        vscode.commands.registerCommand('aws.caws.openProject', async () => await openCawsResource('project')),
        vscode.commands.registerCommand('aws.caws.openRepo', async () => await openCawsResource('repo')),
        vscode.commands.registerCommand('aws.caws.cloneRepo', async () => await cloneCawsRepo()),
        vscode.commands.registerCommand('aws.caws.listCommands', async () => await listCommands())
    )
}

/**
 * Shows a picker and returns the user-selected item.
 */
async function selectCawsResource(
    kind: 'org' | 'project' | 'repo'
): Promise<caws.CawsOrg | caws.CawsProject | caws.CawsRepo | undefined> {
    if (!ext.checkCaws()) {
        return
    }
    const helpButton = createHelpButton(localize('AWS.command.help', 'View Toolkit Documentation'))

    const picker = vscode.window.createQuickPick<vscode.QuickPickItem>()
    picker.busy = true
    picker.canSelectMany = false
    picker.ignoreFocusOut = true
    picker.matchOnDetail = false
    picker.matchOnDescription = true

    if (kind === 'org') {
        picker.title = 'Open CODE.AWS Organization'
        picker.placeholder = 'Choose an organization'
    } else if (kind === 'project') {
        picker.title = 'Open CODE.AWS Project'
        picker.placeholder = 'Choose a project'
    } else {
        picker.title = 'Open CODE.AWS repository'
        picker.placeholder = 'Choose a repository'
    }

    const c = ext.caws
    const populator = new IteratorTransformer<vscode.QuickPickItem, vscode.QuickPickItem>(
        () => c.cawsItemsToQuickpickIter(kind),
        o => (!o ? [] : [o])
    )
    const controller = new pickerLib.IteratingQuickPickController(picker, populator)
    controller.startRequests()

    const choices =
        (await pickerLib.promptUser({
            picker: picker,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                } else if (button === helpButton) {
                    vscode.env.openExternal(vscode.Uri.parse(caws.cawsHelpUrl, true))
                }
            },
        })) ?? []

    const choice = choices[0]
    if (!choice) {
        return undefined
    }
    const val = (choice as any).val
    if (kind === 'org') {
        return val as caws.CawsOrg
    } else if (kind === 'project') {
        return val as caws.CawsProject
    }
    return val as caws.CawsRepo
}

/**
 * Implements commands:
 * - "Open CODE.AWS Organization"
 * - "Open CODE.AWS Project"
 * - "Open CODE.AWS Repository"
 */
async function openCawsResource(kind: 'org' | 'project' | 'repo'): Promise<void> {
    if (!ext.checkCaws()) {
        return
    }
    const c = ext.caws
    const o = await selectCawsResource(kind)
    if (!o) {
        return
    }
    c.openCawsUrl(o)
}

/** "List CODE.AWS Commands" command. */
async function listCommands(): Promise<void> {
    vscode.commands.executeCommand('workbench.action.quickOpen', '> CODE.AWS')
}

/** "Connect to CODE.AWS" command. */
async function cawsConnect(): Promise<void> {
    const userSecret = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: 'cookie: code-aws-cognito-session=...',
        prompt: 'Input credentials',
        password: false, // TODO
    })
    if (!userSecret) {
        return
    }

    const c = ext.caws
    await c.onCredentialsChanged(undefined, userSecret)

    const sess = await c.verifySession()
    if (!sess?.identity) {
        msg.showViewLogsMessage('CODE.AWS: failed to connect')
        return
    }

    ext.awsContext.setCawsCredentials(c.user(), userSecret)
}

/** "Sign out of CODE.AWS" command. */
async function cawsLogout(): Promise<void> {
    if (!ext.awsContext.getCawsCredentials()) {
        return
    }
    await ext.caws.onCredentialsChanged(undefined, undefined)
    ext.awsContext.setCawsCredentials('', '')
}

/** "Clone CODE.AWS Repository" command. */
async function cloneCawsRepo(): Promise<void> {
    if (!ext.checkCaws()) {
        return
    }
    const c = ext.caws
    const r = (await selectCawsResource('repo')) as caws.CawsRepo
    if (!r) {
        return
    }
    const cloneLink = await c.toCawsGitCloneLink(r)
    vscode.commands.executeCommand('git.clone', cloneLink)
}
