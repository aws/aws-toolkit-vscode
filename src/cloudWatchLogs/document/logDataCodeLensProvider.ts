/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from '../../shared/constants'
import { LogDataRegistry } from '../registry/logDataRegistry'
import { isLogStreamUri } from '../cloudWatchLogsUtils'

/** Provides the "Load newer/older events..." codelenses. */
export class LogDataCodeLensProvider implements vscode.CodeLensProvider {
    public constructor(private readonly registry: LogDataRegistry) {}

    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
    public get onDidChangeCodeLenses(): vscode.Event<void> {
        return this._onDidChangeCodeLenses.event
    }

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        const uri = document.uri
        const isBusy = this.registry.getBusyStatus(uri)

        const busyCommand: vscode.Command = {
            title: localize('AWS.message.loading', 'Loading...'),
            command: 'aws.doNothingCommand',
        }
        const codelenses = []
        const newerCodelense = {
            range: new vscode.Range(
                new vscode.Position(document.lineCount - 1, 0),
                new vscode.Position(document.lineCount - 1, 0)
            ),
            isResolved: true,
            command: isBusy
                ? busyCommand
                : {
                      title: localize('AWS.cwl.codeLens.loadNewer', 'Load newer events...'),
                      command: 'aws.addLogEvents',
                      arguments: [document, this.registry, 'tail', this._onDidChangeCodeLenses],
                  },
        }

        const oldCodeLense = {
            range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
            isResolved: true,
            command: isBusy
                ? busyCommand
                : {
                      title: localize('AWS.cwl.codeLens.loadOlder', 'Load older events...'),
                      command: 'aws.addLogEvents',
                      arguments: [document, this.registry, 'head', this._onDidChangeCodeLenses],
                  },
        }

        // log stream documents always start at the oldest log event, so no need to get older events
        if (!isLogStreamUri(uri)) {
            codelenses.push(oldCodeLense)
        }
        codelenses.push(newerCodelense)
        return uri.scheme === CLOUDWATCH_LOGS_SCHEME ? codelenses : []
    }
}
