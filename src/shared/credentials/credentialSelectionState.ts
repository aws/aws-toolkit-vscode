/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 */

'use strict'

import { QuickPickItem } from "vscode"

export interface CredentialSelectionState {
    title: string
    step: number
    totalSteps: number
    credentialProfile: QuickPickItem | undefined
    accesskey: string
    secretKey: string
    profileName: string
}
