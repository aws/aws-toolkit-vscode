/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from '../../shared/constants'
import { LogStreamRegistry } from '../registry/logStreamRegistry'

export class LogStreamCodeLensProvider implements vscode.CodeLensProvider {
    public constructor(private readonly registry: LogStreamRegistry) {}

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

        const codelenses = [
            // first line of virtual doc: always show "Load Older"
            {
                range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
                isResolved: true,
                command: isBusy
                    ? busyCommand
                    : {
                          title: localize('AWS.cloudWatchLogs.codeLens.loadOlder', 'Load older events...'),
                          command: 'aws.addLogEvents',
                          arguments: [document, this.registry, 'head', this._onDidChangeCodeLenses],
                      },
            },
            // last line of virtual doc: always show "Load Newer"
            {
                range: new vscode.Range(
                    new vscode.Position(document.lineCount - 1, 0),
                    new vscode.Position(document.lineCount - 1, 0)
                ),
                isResolved: true,
                command: isBusy
                    ? busyCommand
                    : {
                          title: localize('AWS.cloudWatchLogs.codeLens.loadNewer', 'Load newer events...'),
                          command: 'aws.addLogEvents',
                          arguments: [document, this.registry, 'tail', this._onDidChangeCodeLenses],
                      },
            },
        ]

        return uri.scheme === CLOUDWATCH_LOGS_SCHEME ? codelenses : []
    }
}
