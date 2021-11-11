/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Window } from '../shared/vscode/window'
import * as localizedText from '../shared/localizedText'

import * as nls from 'vscode-nls'
import { cawsHelpUrl } from '../shared/clients/cawsClient'
import { Commands } from '../shared/vscode/commands'
const localize = nls.loadMessageBundle()

export function promptCawsNotConnected(window = Window.vscode(), commands = Commands.vscode()): void {
    const connect = localize('AWS.command.caws.connect', 'Connect to CODE.AWS')
    window
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
