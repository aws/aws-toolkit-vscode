/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SettingsForm } from './wizards/environmentSettings'

// these need to be separate otherwise many node files will get bundled into the Vue build
export const DEFAULT_COMPUTE_SETTINGS: SettingsForm & { inactivityTimeoutMinutes: number } = {
    inactivityTimeoutMinutes: 30,
    instanceType: 'mde.medium',
    persistentStorage: { sizeInGiB: 0 },
}
