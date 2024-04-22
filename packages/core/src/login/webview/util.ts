/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { cwQuickPickSource, cwTreeNodeSource, amazonQChatSource } from '../../codewhisperer/commands/types'
import { ExtStartUpSources } from '../../shared/telemetry'
import { vscodeComponent } from '../../shared/vscode/commands2'

export type AuthUiClick =
    | 'auth_backButton'
    | 'auth_cancelButton'
    | 'auth_continueButton'
    | 'auth_idcOption'
    | 'auth_builderIdOption'
    | 'auth_credentialsOption'
    | 'auth_codecatalystOption'
    | 'auth_existingAuthOption'
    | 'auth_regionSelection'
    | 'auth_codeCatalystSignIn'
    | 'auth_toolkitCloseButton'
    | 'amazonq_switchToQSignIn'

/**
 * Different places the Add Connection command could be executed from.
 *
 * Useful for telemetry.
 */
export const AuthSources = {
    addConnectionQuickPick: 'addConnectionQuickPick',
    firstStartup: ExtStartUpSources.firstStartUp,
    codecatalystDeveloperTools: 'codecatalystDeveloperTools',
    vscodeComponent: vscodeComponent,
    cwQuickPick: cwQuickPickSource,
    cwTreeNode: cwTreeNodeSource,
    amazonQChat: amazonQChatSource,
    authNode: 'authNode',
} as const

export type AuthSource = (typeof AuthSources)[keyof typeof AuthSources]
