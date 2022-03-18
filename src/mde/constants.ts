/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SettingsForm } from './wizards/environmentSettings'

// these need to be separate otherwise many node files will get bundled into the Vue build
export const DEFAULT_COMPUTE_SETTINGS: SettingsForm & { inactivityTimeoutMinutes: number } = {
    inactivityTimeoutMinutes: 30,
    instanceType: 'dev.standard1.medium',
    persistentStorage: { sizeInGiB: 16 },
}

/**
 * maps friendly names to tag names
 */
export const VSCODE_MDE_TAGS = {
    repository: 'mde:repository',
    repositoryBranch: 'mde:repository-branch',
    email: 'mde:email-hash',
    tool: 'mde:created-by-tool',
}

/** Fields that can only be changed on creation */
export const CREATE_ONLY_FIELDS: (keyof SettingsForm)[] = ['persistentStorage']
/** Used in global state */
export const MDE_RESTART_KEY = 'MDE_RESTART'
/** MDE hostname prefix used in the Toolkit-managed local SSH config. */
export const HOST_NAME_PREFIX = 'aws-mde-'
