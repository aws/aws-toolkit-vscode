/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { CfnEnvironmentManager } from '../../cfn-init/cfnEnvironmentManager'
import { commandKey } from '../../utils'

export class CfnEnvironmentsNode extends AWSTreeNodeBase {
    public constructor(readonly environmentManager: CfnEnvironmentManager) {
        const selectedEnv = environmentManager.getSelectedEnvironmentName()
        const label = selectedEnv ? `Environment: ${selectedEnv}` : 'Environment: not selected'

        super(label, TreeItemCollapsibleState.None)
        this.contextValue = 'environmentsSection'
        this.iconPath = new ThemeIcon('settings-gear')
        this.tooltip = selectedEnv
            ? `Current environment: ${selectedEnv}. Click to select a different environment.`
            : 'No environment selected. Click to select an environment.'
        this.command = {
            command: commandKey('environment.select'),
            title: 'Select Environment',
        }
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return []
    }
}
