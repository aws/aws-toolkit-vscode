/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Region } from './endpoints'

// Provides AWS Region Information
export interface RegionProvider {
    onRegionProviderUpdated: vscode.Event<void>

    getDnsSuffixForRegion(regionId: string): string | undefined
    getPartitionId(regionId: string): string | undefined
    getRegions(partitionId: string): Region[]
    isServiceInRegion(serviceId: string, regionId: string): boolean
}
