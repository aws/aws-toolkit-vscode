/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { QuickPickItem, QuickInputButton, Uri } from "vscode"
import { CredentialSelectionState } from "./credentialSelectionState"
import { MultiStepInputFlowController } from "../multiStepInputFlowController"

export class AddProfileButton implements QuickInputButton {
    constructor(public iconPath: { light: Uri; dark: Uri; }, public tooltip: string) { }
}

export interface CredentialSelectionDataProvider {
    existingProfileNames: string[]
    pickCredentialProfile(input: MultiStepInputFlowController, state: Partial<CredentialSelectionState>): Promise<QuickPickItem | AddProfileButton>
    inputProfileName(input: MultiStepInputFlowController, state: Partial<CredentialSelectionState>) : Promise<string | undefined>
    inputAccessKey(input: MultiStepInputFlowController, state: Partial<CredentialSelectionState>) : Promise<string | undefined>
    inputSecretKey(input: MultiStepInputFlowController, state: Partial<CredentialSelectionState>) : Promise<string | undefined>
}
