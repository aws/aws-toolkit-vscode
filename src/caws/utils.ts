/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Window } from '../shared/vscode/window'
import * as localizedText from '../shared/localizedText'

import * as nls from 'vscode-nls'
import { cawsHelpUrl, cawsHostname, CawsOrg, CawsProject, CawsRepo } from '../shared/clients/cawsClient'
import { Commands } from '../shared/vscode/commands'
import { pushIf } from '../shared/utilities/collectionUtils'
const localize = nls.loadMessageBundle()

export async function promptCawsNotConnected(window = Window.vscode(), commands = Commands.vscode()): Promise<void> {
    const connect = localize('AWS.command.caws.connect', 'Connect to CODE.AWS')
    return await window
        .showWarningMessage(
            localize('AWS.caws.badConnection', 'Not connected to CODE.AWS.'),
            connect,
            localizedText.viewDocs
        )
        .then(btn => {
            if (btn === connect) {
                commands.execute('aws.caws.connect')
            } else if (btn === localizedText.viewDocs) {
                vscode.env.openExternal(vscode.Uri.parse(cawsHelpUrl))
            }
        })
}

export function fixcookie(s: string): string {
    s = s.trim()
    s = s.replace(/cookie: /i, '')
    s = s.replace(/code-aws-cognito-session: ?/, 'code-aws-cognito-session=')
    return s
}

/**
 * Builds a web URL from the given CAWS object.
 */
export function toCawsUrl(resource: CawsOrg | CawsProject | CawsRepo) {
    const prefix = `https://${cawsHostname}/organizations`

    const format = (org: string, proj?: string, repo?: string) => {
        const parts = [prefix, org]
        pushIf(parts, !!proj, 'projects', proj)
        pushIf(parts, !!repo, 'source-repositories', repo)

        return parts.concat('view').join('/')
    }

    switch (resource.type) {
        case 'org':
            return format(resource.name)
        case 'project':
            return format(resource.org.name, resource.name)
        case 'repo':
            return format(resource.org.name, resource.project.name, resource.name)
    }
}

export function openCawsUrl(o: CawsOrg | CawsProject | CawsRepo) {
    const url = toCawsUrl(o)
    vscode.env.openExternal(vscode.Uri.parse(url))
}

/**
 * Builds a web URL from the given CAWS object.
 */
export function toCawsUrl(o: CawsOrg | CawsProject | CawsRepo) {
    const prefix = `https://${cawsHostname}/organizations`
    let url: string
    if ((o as CawsRepo).project) {
        const r = o as CawsRepo
        url = `${prefix}/${r.org.name}/projects/${r.project.name}/source-repositories/${r.name}/view`
    } else if ((o as CawsProject).org) {
        const p = o as CawsProject
        url = `${prefix}/${p.org.name}/projects/${p.name}/view`
    } else {
        url = `${prefix}/${o.name}/view`
    }
    return url
}

export function openCawsUrl(o: CawsOrg | CawsProject | CawsRepo) {
    const url = toCawsUrl(o)
    vscode.env.openExternal(vscode.Uri.parse(url))
}
