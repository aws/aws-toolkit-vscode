/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RegionInfo } from './regionInfo'

// Provides AWS Region Information
export interface RegionProvider {
    onRegionProviderUpdated: vscode.Event<void>

    getRegionData(): Promise<RegionInfo[]>
    isServiceInRegion(serviceId: string, regionId: string): boolean
}
