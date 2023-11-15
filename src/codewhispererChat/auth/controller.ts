/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUtil } from "../../codewhisperer/util/authUtil"
import { AuthFollowUpType } from "./model"
import {commands} from 'vscode'

export class AuthController {

    public handleAuth(type: AuthFollowUpType){
        switch(type){
            case 'full-auth':
                this.handleFullAuth()
                break
            case 're-auth':
                this.handleReAuth()
                break
        }
    }

    private handleFullAuth(){
        commands.executeCommand('aws.codewhisperer.manageConnections')
    }

    private handleReAuth(){
        AuthUtil.instance.showReauthenticatePrompt()
    }

}