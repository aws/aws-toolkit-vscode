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

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        // should only provide on matching scheme at the provider level but good to double-check
        return document.uri.scheme === CLOUDWATCH_LOGS_SCHEME
            ? [
                  // first line of virtual doc: always show "Load Previous"
                  {
                      range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
                      isResolved: true,
                      command: {
                          title: localize('', ''),
                          command: '',
                          arguments: [],
                      },
                  },
                  // last line of virtual doc: always show "Load Newer"
                  {
                      range: new vscode.Range(
                          new vscode.Position(document.lineCount - 1, 0),
                          new vscode.Position(document.lineCount - 1, 0)
                      ),
                      isResolved: true,
                      command: {
                          title: localize('', ''),
                          command: '',
                          arguments: [],
                      },
                  },
              ]
            : []
    }
}
