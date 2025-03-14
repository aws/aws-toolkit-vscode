/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getIcon } from '../../shared/icons'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { RegionProfile } from '../models/model'
import { showConfirmationMessage } from '../../shared/utilities/messages'

// TODO: Implementation
export class RegionProfileManager {
    private _activeRegionProfile: RegionProfile | undefined

    get activeRegionProfile() {
        return this._activeRegionProfile
    }

    // TODO: Implementation
    async listRegionProfile(): Promise<RegionProfile[]> {
        return [
            {
                name: 'ACME platform work',
                region: 'us-east-1',
                arn: 'foo',
                description: 'Some description for ACME Platform Work',
            },
            {
                name: 'EU payments TEAM',
                region: 'us-east-1',
                arn: 'bar',
                description: 'Some description for EU payments TEAM',
            },
            {
                name: 'CodeWhisperer TEAM',
                region: 'us-east-1',
                arn: 'baz',
                description: 'Some description for CodeWhisperer TEAM',
            },
        ]
    }

    // TODO: Implementation
    async switchRegionProfile(regionProfile: RegionProfile | undefined) {
        if (regionProfile === this.activeRegionProfile) {
            return
        }

        // only prompt to users when users switch from A profile to B profile
        if (this.activeRegionProfile !== undefined && regionProfile !== undefined) {
            const response = await showConfirmationMessage({
                prompt: `Do you want to switch Amazon Q profiles to ${regionProfile?.name}`,
                confirm: 'Switch profiles',
                cancel: 'Cancel',
            })

            if (!response) {
                return
            }
        }

        this._activeRegionProfile = regionProfile
    }

    async generateQuickPickItem(): Promise<DataQuickPickItem<string>[]> {
        const selected = this.activeRegionProfile
        const profiles = await this.listRegionProfile()
        const icon = getIcon('vscode-account')
        const quickPickItems: DataQuickPickItem<string>[] = profiles.map((it) => {
            const label = it.name
            const onClick = async () => {
                await this.switchRegionProfile(it)
            }
            const data = it.arn
            const description = it.region
            const isRecentlyUsed = selected ? selected.arn === it.arn : false

            return {
                label: `${icon} ${label}`,
                onClick: onClick,
                data: data,
                description: description,
                recentlyUsed: isRecentlyUsed,
                detail: it.description,
            }
        })

        return quickPickItems
    }
}
