/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ConversationState {
    IDLE,
}

export class Session {
    // Used to keep track of whether or not the current session is currently authenticating/needs authenticating
    public isAuthenticating: boolean = false

    // A tab may or may not be currently open
    public tabID: string | undefined

    public conversationState: ConversationState = ConversationState.IDLE

    public scanUuid: string | undefined

    constructor() {}

    public isTabOpen(): boolean {
        return this.tabID !== undefined
    }
}
