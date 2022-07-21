/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Window } from '../shared/vscode/window'
import * as localizedText from '../shared/localizedText'

import * as nls from 'vscode-nls'
import { CawsResource, getCawsConfig } from '../shared/clients/cawsClient'
import { Commands } from '../shared/vscode/commands'
import { pushIf } from '../shared/utilities/collectionUtils'
import { Ides } from '../../types/clientcodeaws'
const localize = nls.loadMessageBundle()

export async function promptCawsNotConnected(window = Window.vscode(), commands = Commands.vscode()): Promise<void> {
    const connect = localize('AWS.command.caws.login', 'Connect to REMOVED.codes')
    return await window
        .showWarningMessage(
            localize('AWS.caws.badConnection', 'Not connected to REMOVED.codes.'),
            connect,
            localizedText.viewDocs
        )
        .then(btn => {
            if (btn === connect) {
                commands.execute('aws.caws.login')
            } else if (btn === localizedText.viewDocs) {
                vscode.env.openExternal(vscode.Uri.parse(getHelpUrl()))
            }
        })
}

/**
 * Builds a web URL from the given CAWS object.
 */
export function toCawsUrl(resource: CawsResource): string {
    const prefix = `https://${getCawsConfig().hostname}/organizations`

    const format = (org: string, proj?: string, repo?: string, branch?: string) => {
        const parts = [prefix, org]
        pushIf(parts, !!proj, 'projects', proj)
        pushIf(parts, !!repo, 'source-repositories', repo)
        pushIf(parts, !!branch, 'branch', 'refs', 'heads', branch)

        return parts.concat('view').join('/')
    }

    switch (resource.type) {
        case 'org':
            return format(resource.name)
        case 'project':
            return format(resource.org.name, resource.name)
        case 'repo':
            return format(resource.org.name, resource.project.name, resource.name)
        case 'branch':
            return format(resource.org.name, resource.project.name, resource.repo.name, resource.name)
        case 'developmentWorkspace':
            // There's currently no page to view an individual workspace
            // This may be changed to direct to the underlying repository instead
            return [prefix, resource.org.name, 'projects', resource.project.name, 'development-workspaces'].join('/')
    }
}

export function getHelpUrl(): string {
    return `https://${getCawsConfig().hostname}/help`
}

/**
 * Builds a web URL from the given CAWS object.
 */
export function openCawsUrl(o: CawsResource) {
    const url = toCawsUrl(o)
    vscode.env.openExternal(vscode.Uri.parse(url))
}

export function isCawsVSCode(ides: Ides | undefined): boolean {
    return ides !== undefined && ides.findIndex(ide => ide.name === 'VSCode') !== -1
}
