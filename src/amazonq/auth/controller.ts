/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { reconnect, showManageCwConnections } from '../../codewhisperer/commands/basicCommands'
import { amazonQChatSource } from '../../codewhisperer/commands/types'
import { recordTelemetryChatRunCommand } from '../../codewhispererChat/controllers/chat/telemetryHelper'
import { placeholder } from '../../shared/vscode/commands2'
import { AuthFollowUpType } from './model'

export class AuthController {
    public handleAuth(type: AuthFollowUpType) {
        switch (type) {
            case 'use-supported-auth':
            case 'full-auth':
                this.handleFullAuth()
                recordTelemetryChatRunCommand('auth', type)
                break
            case 'missing_scopes':
            case 're-auth':
                this.handleReAuth()
                recordTelemetryChatRunCommand('auth', type)
                break
        }
    }

    private handleFullAuth() {
        showManageCwConnections.execute(placeholder, amazonQChatSource)
    }

    private handleReAuth() {
        reconnect.execute(placeholder, amazonQChatSource, true)
    }
}
