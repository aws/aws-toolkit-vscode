/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { AwsResourceManager } from '../../dynamicResources/awsResourceManager'
import { ResourceNode } from '../../dynamicResources/explorer/nodes/resourceNode'

export class ResourceCodeLensProvider implements vscode.CodeLensProvider {
    private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
    public get onDidChangeCodeLenses(): vscode.Event<void> {
        return this._onDidChangeCodeLenses.event
    }

    public constructor(public readonly resourceManager: AwsResourceManager) {}

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        const uri = document.uri
        const resource = this.resourceManager.fromUri(uri)
        if (resource) {
            const type = resource instanceof ResourceNode ? resource.parent : resource
            const codelenses = [
                {
                    range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
                    isResolved: true,
                    command: {
                        title: localize(
                            'aws.resources.codelens.docs',
                            'View resource documentation ({0})',
                            type.typeName
                        ),
                        command: 'aws.resources.viewDocs',
                        arguments: [type],
                    },
                },
            ]

            return uri.scheme === 'file' ? codelenses : []
        }
        return []
    }
}
