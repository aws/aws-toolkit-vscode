/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'
import * as vscode from 'vscode'

import { SsmDocumentClient } from '../../shared/clients/ssmDocumentClient'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'

import { ext } from '../../shared/extensionGlobals'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { isFileIconThemeSeti } from '../../shared/utilities/vsCodeUtils'

export class DocumentItemNode extends AWSTreeNodeBase {
    public constructor(
        private documentItem: SSM.Types.DocumentIdentifier,
        public readonly client: SsmDocumentClient,
        public readonly regionCode: string
    ) {
        super('')
        this.update(documentItem)
        this.contextValue = 'awsDocumentItemNode'
        this.iconPath = fileIconPath()
    }

    public update(documentItem: SSM.Types.DocumentIdentifier): void {
        this.documentItem = documentItem
        this.label = this.documentName
    }

    public get documentName(): string {
        return this.documentItem.Name || ''
    }

    public get documentOwner(): string {
        return this.documentItem.Owner || ''
    }

    public async executeDocument() {
        let executeDocumentUrl: string =
            'https://console.aws.amazon.com/systems-manager/automation/execute/' +
            this.documentName +
            '?region=' +
            this.regionCode
        vscode.env.openExternal(vscode.Uri.parse(executeDocumentUrl))
    }

    public async getDocumentContent(
        documentVersion?: string,
        documentFormat?: string
    ): Promise<SSM.Types.GetDocumentResult> {
        if (!this.documentName || !this.documentName.length) {
            return Promise.resolve({})
        }

        return await this.client.getDocument(
            this.documentName,
            documentVersion || this.documentItem.DocumentVersion,
            documentFormat || this.documentItem.DocumentFormat
        )
    }

    public async listSchemaVersion(): Promise<SSM.Types.DocumentVersionInfo[]> {
        return await toArrayAsync(this.client.listDocumentVersions(this.documentName))
    }
}

function fileIconPath(): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } {
    // Workaround for https://github.com/microsoft/vscode/issues/85654
    // Once this is resolved, ThemeIcons can be used for seti as well
    if (isFileIconThemeSeti()) {
        return {
            dark: vscode.Uri.file(ext.iconPaths.dark.file),
            light: vscode.Uri.file(ext.iconPaths.light.file),
        }
    } else {
        return vscode.ThemeIcon.File
    }
}
