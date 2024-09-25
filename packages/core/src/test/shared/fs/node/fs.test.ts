/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestFolder } from '../../../testUtil'
import { NodeFileSystem } from '../../../../shared/fs/node/fs'
import { fs } from '../../../../shared/fs/fs'
import assert from 'assert'
import { sleep, ToolkitError, waitUntil } from '../../../../shared'
import { LockOptions } from 'proper-lockfile'
import LockFile from 'proper-lockfile'

class TestNodeFileSystem extends NodeFileSystem {
    public constructor() {
        super()
    }

    public override get lockOptions(): LockOptions {
        const options: LockOptions = {
            ...super.lockOptions,
            retries: {
                maxRetryTime: 1000, // How long to try to acquire the lock before giving up
                minTimeout: 100, // How long to wait between each retrying, but changes with exponential backoff
                factor: 1, // no exponential backoff for tests
            },
        }
        return options
    }
}

describe('NodeFileSystem', async function () {
    let testFolder: TestFolder
    let testFs: TestNodeFileSystem

    before(async function () {
        testFs = new TestNodeFileSystem()
    })

    beforeEach(async function () {
        testFolder = await TestFolder.create()
    })

    describe('lock', async function () {
        it('subsequent write not using lock method ignores lock file', async function () {
            const filePath = await testFolder.write('test.txt', 'Nothing Yet')

            // Acquire the lock and delay a bit allowing the subsequent write to complete before this one
            const lock = testFs.lock(filePath, async () => {
                await sleep(300) // FLAKY: should be enough time for the other write to finish, increase if flaky
                await fs.writeFile(filePath, 'lock 1 text')
            })
            // ensure lock is acquired (if we stop using proper-lockfile this needs an update)
            assert.ok(await waitUntil(async () => LockFile.check(filePath), { interval: 10, timeout: 5000 }))

            // Function Under Test: Ignore the lock and write to the file
            await fs.writeFile(filePath, 'Did not honor lock')
            assert.strictEqual(await fs.readFileAsString(filePath), 'Did not honor lock')

            // The initial file to acquire the lock eventually finished and overwrote the file
            // after the lock ignoring write finished
            await lock
            assert.strictEqual(await fs.readFileAsString(filePath), 'lock 1 text')
        })

        it('2nd lock waits for 1st to finish before writing', async function () {
            const filePath = await testFolder.write('test.txt', 'Nothing Yet')

            // Acquire the lock and delay, requiring the 2nd lock to wait a few cycles
            const lock1 = testFs.lock(filePath, async () => {
                await sleep((testFs.lockOptions.retries as any)!.minTimeout! * 2)
                await fs.writeFile(filePath, 'lock 1 text')
            })
            // ensure lock is acquired (if we stop using proper-lockfile this needs an update)
            assert.ok(await waitUntil(async () => LockFile.check(filePath), { interval: 10, timeout: 5000 }))

            // Attempt to acquire the lock and immediately write
            const lock2 = testFs.lock(filePath, async () => {
                assert.deepStrictEqual(await fs.readFileAsString(filePath), 'lock 1 text')
                await fs.writeFile(filePath, 'lock 2 text')
            })

            await Promise.all([lock1, lock2])
            // The subsequent write waited for the lock to be acquired after the first was done
            assert.strictEqual(await fs.readFileAsString(filePath), 'lock 2 text')
        })

        it('throws if file does not exist', async function () {
            // It is up to the caller to ensure that the file exists before they acquire the lock
            await assert.rejects(
                () => testFs.lock(testFolder.pathFrom('thisDoesNotExist'), async () => {}),
                (e) => {
                    return (
                        e instanceof ToolkitError &&
                        e.code === 'NodeLockError' &&
                        e.cause?.message.includes('ENOENT: no such file or directory')
                    )
                }
            )
        })

        it('can acquire lock on previous lock crash', async function () {
            const filePath = await testFolder.write('test.txt', 'Nothing Yet')

            await assert.rejects(() =>
                testFs.lock(filePath, async () => {
                    throw new Error('Test Error')
                })
            )

            let acquiredLock = false
            await testFs.lock(filePath, async () => {
                acquiredLock = true
            })

            assert.strictEqual(acquiredLock, true)
        })
    })
})
