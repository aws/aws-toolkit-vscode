/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeErrorHandlerNode } from '../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { convertEcsArnToResourceName } from '../explorerUtils'
import { EcsTaskDefinitionNode, EcsTaskDefinitionsNode } from './ecsNodeInterfaces'

export class DefaultEcsTaskDefinitionNode extends AWSTreeErrorHandlerNode implements EcsTaskDefinitionNode {

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(
        public readonly parent: EcsTaskDefinitionsNode,
        public arn: string,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('')
        // TODO: Get new icons
        // These currently display blank space
        this.iconPath = {
            dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/ecsTaskDef.svg')),
            light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/ecsTaskDef.svg')),
        }
        this.update(arn)
    }

    public update(arn: string) {
        this.arn = arn
        this.tooltip = arn
        this.label = convertEcsArnToResourceName(arn)
    }
}
