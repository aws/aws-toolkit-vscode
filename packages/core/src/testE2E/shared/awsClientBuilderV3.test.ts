/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'http'
import assert from 'assert'
import { SSMClient, DescribeSessionsCommand } from '@aws-sdk/client-ssm'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { globals } from '../../shared'

describe('AWSClientBuilderV3', function () {
    const port = 3000
    let server: http.Server
    let requests: http.IncomingMessage[]

    before(function () {
        server = http.createServer({ keepAlive: true }, (req, rsp) => {
            rsp.writeHead(200, { 'Content-Type': 'application/json' })
            rsp.end(JSON.stringify({ message: 'success' }))
        })
        server.listen(port, () => {})
        server.on('request', (req) => {
            requests.push(req)
        })
    })

    beforeEach(function () {
        requests = []
    })

    after(function () {
        server.close()
    })

    it('reuses existing HTTP connections', async function () {
        const httpHandler = new NodeHttpHandler({
            httpAgent: new http.Agent({ keepAlive: true }),
        })
        const client = await globals.sdkClientBuilderV3.createAwsService(SSMClient, {
            region: 'us-east-1',
            endpoint: `http://localhost:${port}`,
            requestHandler: httpHandler,
        })
        await client.send(new DescribeSessionsCommand({ State: 'Active' }))
        await client.send(new DescribeSessionsCommand({ State: 'Active' }))

        assert.strictEqual(requests[0].headers.connection, 'keep-alive')
        assert.strictEqual(requests[1].headers.connection, 'keep-alive')
        assert.strictEqual(server.connections, 1)
    })
})
