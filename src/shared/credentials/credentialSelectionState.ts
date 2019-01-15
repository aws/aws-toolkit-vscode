/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { types as vscode } from '../vscode'

export interface CredentialSelectionState {
    title: string
    step: number
    totalSteps: number
    credentialProfile: vscode.QuickPickItem | undefined
    accesskey: string
    secretKey: string
    profileName: string
}
