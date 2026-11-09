/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http'
import * as sinon from 'sinon'
import { SessionStore } from '../../../../../awsService/sagemaker/detached-server/sessionStore'

export interface RouteTestContext {
    req: Partial<http.IncomingMessage>
    res: Partial<http.ServerResponse>
    resWriteHead: sinon.SinonSpy
    resEnd: sinon.SinonSpy
    storeStub: sinon.SinonStubbedInstance<SessionStore>
}

export function createRouteTestContext(): RouteTestContext {
    const resWriteHead = sinon.spy()
    const resEnd = sinon.spy()
    return {
        req: {},
        res: { writeHead: resWriteHead, end: resEnd },
        resWriteHead,
        resEnd,
        storeStub: sinon.createStubInstance(SessionStore),
    }
}
