/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { MultiStepInputFlowController } from '../multiStepInputFlowController'
import { CredentialSelectionState } from './credentialSelectionState'

export interface CredentialSelectionDataProvider {
    existingProfileNames: string[]

    pickCredentialProfile(
        input: MultiStepInputFlowController,
        actions: vscode.QuickPickItem[],
        state: Partial<CredentialSelectionState>
    ): Promise<vscode.QuickPickItem>

    inputProfileName(
        input: MultiStepInputFlowController,
        state: Partial<CredentialSelectionState>
    ): Promise<string | undefined>

    inputAccessKey(
        input: MultiStepInputFlowController,
        state: Partial<CredentialSelectionState>
    ): Promise<string | undefined>

    inputSecretKey(
        input: MultiStepInputFlowController,
        state: Partial<CredentialSelectionState>
    ): Promise<string | undefined>
}
