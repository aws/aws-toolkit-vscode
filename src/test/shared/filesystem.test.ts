/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as os from 'os'
import * as path from 'path'
import { access, mkdir, readdir, readFile, stat, writeFile } from '../../shared/filesystem'
import { fileExists, mkdtemp } from '../../shared/filesystemUtilities'

describe('filesystem', () => {
    const filename = 'file.txt'
    let tempFolder: string
    let filePath: string

    beforeEach(async () => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = await mkdtemp()
        filePath = path.join(tempFolder, filename)
    })

    afterEach(async () => {
        await del([ tempFolder ], { force: true })
    })

    describe('accessAsync', () => {
        it('does not throw if no error occurs', async () => {
            await writeFile(filePath, 'Hello, World!', 'utf8')

            assert.doesNotThrow(async () => await access(filePath))
        })

        it('throws if error occurs', async () => {
            let error: NodeJS.ErrnoException | undefined

            try {
                await access(filePath)
            } catch (err) {
                error = err as NodeJS.ErrnoException | undefined
            }

            assert.ok(error)

            const expected = os.platform() === 'win32' ? -4058 : -2 // ENOENT: no such file or directory
            assert.strictEqual(error!.errno, expected)
        })

        it('accepts Buffer-based paths', async () => {
            await writeFile(filePath, 'Hello, World!', 'utf8')
            const buffer: Buffer = Buffer.from(filePath)

            assert.doesNotThrow(async () => await access(buffer))
        })
    })

    describe('mkdirAsync', () => {
        it('creates a directory at the specified path', async () => {
            const myPath = path.join(tempFolder, 'myPath')
            await mkdir(myPath)
            assert.strictEqual(await fileExists(myPath), true)

            const statResult = await stat(myPath)
            assert.ok(statResult)
            assert.strictEqual(statResult.isDirectory(), true)
        })

        it('rejects if path contains invalid characters', async () => {
            let error: Error | string | undefined

            try {
                await mkdir('\n\0')
            } catch (err) {
                error = err as Error | string | undefined
            } finally {
                assert.ok(error)
            }
        })
    })

    describe('mkdtempAsync', () => {
        it('creates a directory with the specified prefix', async () => {
            const actual = await mkdtemp('myPrefix')

            assert.ok(actual)
            assert.strictEqual(path.basename(actual).startsWith('myPrefix'), true)
            assert.strictEqual(await fileExists(actual), true)
        })

        it('rejects if prefix contains invalid path characters', async () => {
            let error: Error | string | undefined

            try {
                await mkdtemp('\n\0')
            } catch (err) {
                error = err as Error | string | undefined
            } finally {
                assert.ok(error)
            }
        })
    })

    describe('readdirAsync',  () => {
        it('reads non-empty directories', async () => {
            await writeFile(filePath, 'Hello, World!', 'utf8')
            const actual = await readdir(tempFolder)

            assert.ok(actual)
            assert.strictEqual(actual.length, 1)
            assert.strictEqual(actual[0], filename)
        })

        it('reads empty directories', async () => {
            const actual = await readdir(tempFolder)

            assert.ok(actual)
            assert.strictEqual(actual.length, 0)
        })

        it('rejects if directory does not exist', async () => {
            const wrongFolder = path.join(path.dirname(tempFolder), path.basename(tempFolder) + 'WRONG')
            let error: Error | string | undefined
            try {
                await readdir(wrongFolder)
            } catch (err) {
                error = err as Error | string | undefined
            } finally {
                assert.ok(error)
            }
        })

        it('accepts Buffer-based paths', async () => {
            await writeFile(filePath, 'Hello, World!', 'utf8')
            const actual = await readdir(Buffer.from(tempFolder))

            assert.ok(actual)
            assert.strictEqual(actual.length, 1)
            assert.strictEqual(actual[0], filename)
        })
    })

    describe('readFileAsync', () => {
        it('reads empty text files', async () => {
            await writeFile(filePath, '', 'utf8')
            const actual = await readFile(filePath, 'utf8')

            assert.strictEqual(actual, '')
        })

        it('reads non-empty text files', async () => {
            await writeFile(filePath, 'Hello, World!', 'utf8')
            const actual = await readFile(filePath, 'utf8')

            assert.ok(actual)
            assert.strictEqual(actual, 'Hello, World!')
        })

        it('reads empty binary files', async () => {
            await writeFile(filePath, '', 'binary')
            // tslint:disable-next-line:no-null-keyword
            const actual = await readFile(filePath)

            assert.ok(actual)
            assert.strictEqual(actual instanceof Buffer, true)
            assert.strictEqual((actual as Buffer).toString('binary'), '')
        })

        it('reads non-empty binary files', async () => {
            await writeFile(filePath, 'Hello, World!', 'binary')
            // tslint:disable-next-line:no-null-keyword
            const actual = await readFile(filePath)

            assert.ok(actual)
            assert.strictEqual(actual instanceof Buffer, true)
            assert.strictEqual((actual as Buffer).toString('binary'), 'Hello, World!')
        })

        it('rejects if file does not exist', async () => {
            let error: Error | string | undefined
            try {
                await readFile(filePath, 'utf8')
            } catch (err) {
                error = err as Error | string | undefined
            } finally {
                assert.ok(error)
            }
        })
    })

    describe('statAsync', () => {
        it('gets metadata for empty file', async () => {
            await writeFile(filePath, '', 'utf8')
            const actual = await stat(filePath)

            assert.ok(actual)
            assert.strictEqual(actual.isFile(), true)
            assert.strictEqual(actual.isDirectory(), false)
        })

        it('gets metadata for non-empty file', async () => {
            await writeFile(filePath, 'Hello, World!', 'utf8')
            const actual = await stat(filePath)

            assert.ok(actual)
            assert.strictEqual(actual.isFile(), true)
            assert.strictEqual(actual.isDirectory(), false)
        })

        it('rejects if file does not exist', async () => {
            let error: Error | string | undefined

            try {
                await stat(filePath)
            } catch (err) {
                error = err  as Error | string | undefined
            } finally {
                assert.ok(error)
            }
        })
    })

    describe('writeFileAsync', () => {
        it('writes text data to file', async () => {
            await writeFile(filePath, 'Hello, World!', 'utf8')
            const actual = await readFile(filePath, 'utf8')

            assert.ok(actual)
            assert.strictEqual(actual, 'Hello, World!')
        })

        it('writes binary data to file', async () => {
            await writeFile(filePath, 'Hello, World!', 'binary')
            // tslint:disable-next-line:no-null-keyword
            const actual = await readFile(filePath)

            assert.ok(actual)
            assert.strictEqual(actual instanceof Buffer, true)
            assert.strictEqual((actual as Buffer).toString('binary'), 'Hello, World!')
        })

        it('overwrites existing file', async () => {
            await writeFile(filePath, 'Hello, Tom!', 'utf8')
            await writeFile(filePath, 'Hello, Jane!', 'utf8')
            const actual = await readFile(filePath, 'utf8')

            assert.ok(actual)
            assert.strictEqual(actual, 'Hello, Jane!')
        })

        it('creates file if it doesn\'t already exist', async () => {
            await writeFile(filePath, 'Hello, World!', 'utf8')
            const actual = await readFile(filePath, 'utf8')

            assert.ok(actual)
            assert.strictEqual(actual, 'Hello, World!')
        })

        it('rejects if directory does not exist', async () => {
            const wrongFolder = path.join(path.dirname(tempFolder), path.basename(tempFolder) + 'WRONG')
            const wrongFilePath = path.join(wrongFolder, filename)
            let error: Error | string | undefined

            try {
                await writeFile(path.join(tempFolder, wrongFilePath), 'Hello, World!', 'utf8')
            } catch (err) {
                error = err  as Error | string | undefined
            } finally {
                assert.ok(error)
            }
        })
    })
})
