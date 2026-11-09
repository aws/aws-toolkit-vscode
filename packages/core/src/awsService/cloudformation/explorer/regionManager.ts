/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { RegionProvider } from '../../../shared/regions/regionProvider'
import globals from '../../../shared/extensionGlobals'

const localize = nls.loadMessageBundle()

export class CloudFormationRegionManager {
    private static readonly storageKey = 'aws.cloudformation.region'

    constructor(private readonly regionProvider: RegionProvider) {}

    public getSelectedRegion(): string {
        const cfnRegion = globals.globalState.tryGet<string>(CloudFormationRegionManager.storageKey, String)

        // If no CloudFormation region selected, use credential default region, then AWS explorer region as fallback
        if (!cfnRegion) {
            const credentialDefaultRegion = globals.awsContext.getCredentialDefaultRegion()
            if (credentialDefaultRegion) {
                return credentialDefaultRegion
            }

            const awsExplorerRegions = globals.globalState.tryGet<string[]>('region', Object, [])
            return awsExplorerRegions.length > 0 ? awsExplorerRegions[0] : 'us-east-1'
        }

        return cfnRegion
    }

    public async updateSelectedRegion(region: string): Promise<void> {
        await globals.globalState.update(CloudFormationRegionManager.storageKey, region)
    }

    public async showRegionSelector(): Promise<boolean> {
        const currentRegion = this.getSelectedRegion()
        const allRegions = this.regionProvider.getRegions()

        const items: vscode.QuickPickItem[] = allRegions.map((r) => ({
            label: r.name,
            detail: r.id,
        }))

        const placeholder = localize(
            'cloudformation.showHideRegionPlaceholder',
            'Select region for CloudFormation panel'
        )

        const result = await vscode.window.showQuickPick(items, {
            placeHolder: placeholder,
            canPickMany: false,
            matchOnDetail: true,
        })

        if (!result || !result.detail) {
            return false
        }

        if (result.detail !== currentRegion) {
            await this.updateSelectedRegion(result.detail)
            return true
        }

        return false
    }
}
