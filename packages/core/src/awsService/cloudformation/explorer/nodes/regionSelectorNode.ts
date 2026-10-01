/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { CloudFormationRegionManager } from '../regionManager'
import { RegionSelectorContextValue } from '../contextValue'
import { commandKey } from '../../utils'

export class RegionSelectorNode extends AWSTreeNodeBase {
    public constructor(regionManager: CloudFormationRegionManager) {
        const currentRegion = regionManager.getSelectedRegion()
        super(currentRegion, TreeItemCollapsibleState.None)
        this.contextValue = RegionSelectorContextValue
        this.iconPath = new ThemeIcon('globe')
        this.tooltip = `Current region: ${currentRegion}. Click to select a different region.`
        this.command = {
            command: commandKey('selectRegion'),
            title: 'Select Region',
        }
    }
}
