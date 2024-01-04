/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isValidAmazonQConnection } from '../../codewhisperer/util/authUtil'
import { Auth } from '../../auth/auth'

async function getValidConnection() {
    return (await Auth.instance.listConnections()).find(isValidAmazonQConnection)
}

export async function setValidConnection() {
    const conn = await getValidConnection()
    let validConnection: boolean

    if (conn !== undefined && Auth.instance.getConnectionState(conn) === 'valid') {
        validConnection = true
        await Auth.instance.useConnection(conn)
    } else {
        validConnection = false
        console.log('No valid auth connection, will skip Amazon Q integration test cases')
    }
    return validConnection
}

export function skipTestIfNoValidConn(validConnection: boolean, ctx: Mocha.Context) {
    if (!validConnection && ctx.currentTest) {
        ctx.currentTest.title += ` (skipped - no valid connection)`
        ctx.currentTest.skip()
    }
}
