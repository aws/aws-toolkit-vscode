/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Messenger } from '../controller/messenger/messenger'

export class Session {
    private preloaderFinished = false

    // Used to keep track of whether or not the current session is currently authenticating/needs authenticating
    public isAuthenticating: boolean = false

    public jobSubmitted: boolean = false

    constructor(messenger: Messenger, public readonly tabID: string) {}

    /**
     * Preload any events that have to run before a chat message can be sent
     * // TODO[gumby]: check job state?
     */
    async preloader(msg: string) {
        if (!this.preloaderFinished) {
            //await this.setupConversation(msg)
            this.preloaderFinished = true
        }
    }
}
