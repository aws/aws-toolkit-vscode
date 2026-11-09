/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'http'
import assert from 'assert'
import { SSMClient, DescribeSessionsCommand } from '@aws-sdk/client-ssm'
import { globals } from '../../shared'
import { Socket } from 'net'

async function closeSocket(socket: Socket) {
    return new Promise((resolve, reject) => {
        socket.end(() => {
            resolve(true)
        })
    })
}

describe('AWSClientBuilderV3', function () {
    const port = 3000
    let server: http.Server
    let requests: http.IncomingMessage[]
    let connections: Socket[]

    before(function () {
        server = http.createServer({ keepAlive: true }, (req, rsp) => {
            rsp.writeHead(200, { 'Content-Type': 'application/json' })
            rsp.end(JSON.stringify({ message: 'success' }))
        })
        server.listen(port, () => {})
        server.on('request', (req) => {
            requests.push(req)
        })
        server.on('connection', (connection) => {
            connections.push(connection)
        })
        connections = []
    })

    beforeEach(async function () {
        requests = []
        await Promise.all(connections.map((c) => closeSocket(c)))
        connections = []
    })

    after(function () {
        server.close()
    })

    it('reuses existing HTTP connections by default', async function () {
        const client = globals.sdkClientBuilderV3.createAwsService({
            serviceClient: SSMClient,
            clientOptions: {
                region: 'us-east-1',
                endpoint: `http://localhost:${port}`,
            },
        })
        assert.strictEqual(connections.length, 0)
        await client.send(new DescribeSessionsCommand({ State: 'Active' }))
        assert.strictEqual(connections.length, 1)
        await client.send(new DescribeSessionsCommand({ State: 'Active' }))
        assert.strictEqual(connections.length, 1)

        assert.strictEqual(requests[0].headers.connection, 'keep-alive')
        assert.strictEqual(requests[1].headers.connection, 'keep-alive')
    })

    it('does not reuse HTTP connections if told not to', async function () {
        const client = globals.sdkClientBuilderV3.createAwsService({
            serviceClient: SSMClient,
            clientOptions: {
                region: 'us-east-1',
                endpoint: `http://localhost:${port}`,
            },
            keepAlive: false,
        })
        assert.strictEqual(connections.length, 0, 'no connections before requesting')
        await client.send(new DescribeSessionsCommand({ State: 'Active' }))
        assert.strictEqual(connections.length, 1, 'one connection after first request')
        await client.send(new DescribeSessionsCommand({ State: 'Active' }))
        assert.strictEqual(connections.length, 2, 'two connections after both requests')

        assert.strictEqual(requests[0].headers.connection, 'close')
        assert.strictEqual(requests[1].headers.connection, 'close')
    })
})
