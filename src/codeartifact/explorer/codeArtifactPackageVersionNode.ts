/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { CodeArtifactClient, CodeArtifactPackageVersion } from '../../shared/clients/codeArtifactClient'
// import { CodeArtifactPackageNode } from './codeArtifactPackageNode'

export class CodeArtifactPackageVersionNode extends AWSTreeNodeBase {
    name: string = this.version.versionName
    status: string = this.version.versionStatus
    regionCode: string = this.codeArtifact.regionCode

    public constructor(
        // public readonly parent: CodeArtifactPackageNode,
        private readonly codeArtifact: CodeArtifactClient,
        // public readonly repository: CodeArtifactRepository,
        // public readonly domain: CodeArtifactDomain,
        // public readonly artifact: CodeArtifactPackage,
        public readonly version: CodeArtifactPackageVersion
    ) {
        super(version.versionName, vscode.TreeItemCollapsibleState.None)
        this.contextValue = 'awsCodeArtifactPackageVersionNode'
    }
}
