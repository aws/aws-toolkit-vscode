/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { CawsRepo } from '../shared/clients/cawsClient'
import { CawsClient } from '../shared/clients/cawsClient'
import globals, { checkCaws } from '../shared/extensionGlobals'
import { ExtContext } from '../shared/extensions'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { LoginWizard } from './wizards/login'
import { selectCawsResource } from './wizards/selectResource'

export async function login(ctx: vscode.ExtensionContext, awsCtx: AwsContext, client: CawsClient): Promise<boolean> {
    const wizard = new LoginWizard(ctx)
    const response = await wizard.run()

    if (!response) {
        return false
    }

    await client.onCredentialsChanged(undefined, response.user.cookie)
    const sess = await client.verifySession()

    if (!sess?.identity) {
        showViewLogsMessage('CODE.AWS: failed to connect')
        return false
    }

    if (response?.user.newUser) {
        ctx.secrets.store(`caws/${client.user()}`, response.user.cookie)
    }

    awsCtx.setCawsCredentials(client.user(), response.user.cookie)
    return true
}

export async function logout(ctx: ExtContext, client: CawsClient): Promise<void> {
    if (!ctx.awsContext.getCawsCredentials()) {
        return
    }
    await client.onCredentialsChanged(undefined, undefined)
    ctx.awsContext.setCawsCredentials('', '')
}

/** "List CODE.AWS Commands" command. */
export async function listCommands(): Promise<void> {
    vscode.commands.executeCommand('workbench.action.quickOpen', '> CODE.AWS')
}

/** "Clone CODE.AWS Repository" command. */
export async function cloneCawsRepo(url?: vscode.Uri): Promise<void> {
    // We need better encapsulation of a CAWS session to propagate through commands
    // The session should live at the top and injected as context
    if (!globals.caws.connected() && !(await login(globals.context, globals.awsContext, globals.caws))) {
        return
    }
    const c = globals.caws

    if (!url) {
        const r = (await selectCawsResource('repo')) as CawsRepo
        if (!r) {
            return
        }
        // TODO: move this logic up into the model
        if (!r.org.name || !r.project.name || !r.name) {
            throw new Error(`Invalid CAWS repo: ${JSON.stringify(r, undefined, 4)}`)
        }
        const cloneLink = await c.toCawsGitUri(r.org.name, r.project.name, r.name)
        vscode.commands.executeCommand('git.clone', cloneLink)
    } else {
        const [_, org, repo, project] = url.path.slice(1).split('/')
        if (!project) {
            throw new Error(`CAWS URL is invalid, project was undefined: ${url.path}`)
        }

        vscode.commands.executeCommand('git.clone', await c.toCawsGitUri(org, repo, project))
    }
}

/**
 * Implements commands:
 * - "Open CODE.AWS Organization"
 * - "Open CODE.AWS Project"
 * - "Open CODE.AWS Repository"
 */
export async function openCawsResource(kind: 'org' | 'project' | 'repo'): Promise<void> {
    if (!checkCaws()) {
        return
    }
    const c = globals.caws
    const o = await selectCawsResource(kind)
    if (!o) {
        return
    }
    c.openCawsUrl(o)
}
