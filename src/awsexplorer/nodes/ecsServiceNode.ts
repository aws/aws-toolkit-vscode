/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeErrorHandlerNode } from '../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { convertEcsArnToResourceName } from '../explorerUtils'
import { EcsServiceNode, EcsServicesNode } from './ecsNodeInterfaces'

export class DefaultEcsServiceNode extends AWSTreeErrorHandlerNode implements EcsServiceNode {

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(
        public readonly parent: EcsServicesNode,
        public arn: string,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('')
        // TODO: Get new icons
        // These currently display blank space
        this.iconPath = {
            dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/ecsService.svg')),
            light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/ecsService.svg')),
        }
        this.update(arn)
    }

    public update(arn: string) {
        this.arn = arn
        this.tooltip = arn
        this.label = convertEcsArnToResourceName(arn, this.parent.parent.label)
    }
}
