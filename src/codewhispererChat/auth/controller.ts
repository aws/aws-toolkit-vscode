/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { showManageCwConnections } from '../../codewhisperer/commands/basicCommands'
import { amazonQChatSource } from '../../codewhisperer/commands/types'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { placeholder } from '../../shared/vscode/commands2'
import { AuthFollowUpType } from './model'

export class AuthController {
    public handleAuth(type: AuthFollowUpType) {
        switch (type) {
            case 'full-auth':
                this.handleFullAuth()
                break
            case 'missing_scopes':
            case 're-auth':
                this.handleReAuth()
                break
        }
    }

    private handleFullAuth() {
        showManageCwConnections.execute(placeholder, amazonQChatSource)
    }

    private handleReAuth() {
        AuthUtil.instance.reauthenticate()
    }
}
