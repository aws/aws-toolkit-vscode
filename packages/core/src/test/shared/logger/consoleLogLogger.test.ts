/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SinonStub, SinonStubbedMember, stub } from 'sinon'
import * as assert from 'assert'
import { ConsoleLogTransport, Level, Levels } from '../../../shared/logger/consoleLogTransport'
import { MESSAGE } from '../../../shared/logger/consoleLogTransport'

describe('ConsoleLogTransport', async function () {
    let fakeConsole: { [key in Level]: SinonStub } & { log: SinonStub }
    let instance: ConsoleLogTransport
    let next: SinonStubbedMember<() => void>

    beforeEach(async function () {
        fakeConsole = createBrowserFakeConsole()
        instance = new ConsoleLogTransport(undefined, fakeConsole as unknown as typeof console)
        next = stub()
    })

    const allLevels = Object.keys(Levels) as Level[]
    allLevels.forEach(level => {
        it(`logs to console with level: '${level}'`, async function () {
            const untilLogged = instance.log({ level, message: 'myMessage', [MESSAGE]: 'myMessageFormatted' }, next)
            await untilLogged
            assert.strictEqual(fakeConsole[level].callCount, 1)
            assert.strictEqual(fakeConsole[level].getCall(0).args[0], 'myMessageFormatted')
            assert.strictEqual(next.callCount, 1)
        })
    })

    it(`logs to the default if non-supported log level provided`, async function () {
        const untilLogged = instance.log(
            { level: 'non-supported', message: 'myMessage', [MESSAGE]: 'myMessageFormatted' },
            next
        )
        await untilLogged
        assert.strictEqual(fakeConsole.log.callCount, 1)
        assert.strictEqual(fakeConsole.log.getCall(0).args[0], 'myMessageFormatted')
        assert.strictEqual(next.callCount, 1)
    })

    function createBrowserFakeConsole() {
        return {
            info: stub(),
            warn: stub(),
            error: stub(),
            debug: stub(),
            log: stub(),
        }
    }
})
