/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUtil } from '../../codewhisperer'

/*
In order to run codewhisperer or gumby integration tests user must:
   
    1) run using VSC launch config.
    2) have a valid codewhisperer/amazon q connection.

Test cases will skip if the above criteria are not met.
If user has an expired connection they must reauthenticate prior to running tests.
*/

export async function setValidConnection() {
    return AuthUtil.instance.isConnected()
}

export function skipTestIfNoValidConn(validConnection: boolean, ctx: Mocha.Context) {
    if (!validConnection && ctx.currentTest) {
        ctx.currentTest.title += ` (skipped - no valid connection)`
        ctx.currentTest.skip()
    }
}
