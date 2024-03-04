/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuickPickItem } from 'vscode'

export interface CredentialSelectionState {
    title: string
    step: number
    totalSteps: number
    credentialProfile: QuickPickItem | undefined
    accesskey: string
    secretKey: string
    profileName: string
}
