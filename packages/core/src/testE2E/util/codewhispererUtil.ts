/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isValidAmazonQConnection } from '../../codewhisperer/util/authUtil'
import { Auth } from '../../auth/auth'

/*
In order to run codewhisperer integration tests user must:
   
    1) run using VSC launch config.
    2) have a valid codewhisperer connection.

Test cases will skip if the above criteria are not met.
If user has an expired connection they must reauthenticate prior to running tests.
*/

async function getValidConnection() {
    return (await Auth.instance.listConnections()).find(isValidAmazonQConnection)
}

//Returns true if a valid connection is found and set, false if not
export async function setValidConnection() {
    const conn = await getValidConnection()
    let validConnection: boolean

    if (conn !== undefined && Auth.instance.getConnectionState(conn) === 'valid') {
        validConnection = true
        await Auth.instance.useConnection(conn)
    } else {
        validConnection = false
        console.log('No valid auth connection, will skip codewhisperer integration test cases')
    }
    return validConnection
}

export function skiptTestIfNoValidConn(validConnection: boolean, ctx: Mocha.Context) {
    if (!validConnection && ctx.currentTest) {
        ctx.currentTest.title += ` (skipped - no valid connection)`
        ctx.currentTest.skip()
    }
}
