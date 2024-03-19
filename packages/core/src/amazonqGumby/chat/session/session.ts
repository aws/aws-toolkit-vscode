/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Messenger } from '../controller/messenger/messenger'

export class Session {
    // Used to keep track of whether or not the current session is currently authenticating/needs authenticating
    public isAuthenticating: boolean = false

    public jobSubmitted: boolean = false

    constructor(messenger: Messenger, public readonly tabID: string) {}
}
