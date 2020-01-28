/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
// import { Memento } from 'vscode'

import StateMachineGraphCache from '../../stepFunctions/utils'

const REQUEST_BODY = 'request body string'
const ASSET_URL = 'https://something'
const FILE_PATH = '/some/path'
const STORAGE_KEY = 'KEY'

describe.only('StateMachineGraphCache', () => {
    describe('updateCachedFile', () => {
        it('downloads a file when it is not in cache and stores it', async () => {
            const globalStorage = {
                update: sinon.spy(),
                get: sinon.stub().returns(undefined)
            }

            const getFileData = sinon.stub().resolves(REQUEST_BODY)
            const fileExists = sinon
                .stub()
                .onFirstCall()
                .resolves(false)
                .onSecondCall()
                .resolves(true)

            const writeFile = sinon.spy()

            const cache = new StateMachineGraphCache({
                getFileData,
                fileExists,
                writeFile,
                cssFilePath: '',
                jsFilePath: '',
                dirPath: ''
            })

            await cache.updateCachedFile({
                globalStorage,
                lastDownloadedURLKey: STORAGE_KEY,
                currentURL: ASSET_URL,
                filePath: FILE_PATH
            })

            assert.ok(globalStorage.update.calledWith(STORAGE_KEY, ASSET_URL))
            assert.ok(writeFile.calledWith(FILE_PATH, REQUEST_BODY))
        })

        it('downloads and stores a file when cached file exists but url has been updated', async () => {
            const globalStorage = {
                update: sinon.spy(),
                get: sinon.stub().returns('https://old-url')
            }

            const getFileData = sinon.stub().resolves(REQUEST_BODY)
            const fileExists = sinon
                .stub()
                .onFirstCall()
                .resolves(true)
                .onSecondCall()
                .resolves(true)

            const writeFile = sinon.spy()

            const cache = new StateMachineGraphCache({
                getFileData,
                fileExists,
                writeFile,
                cssFilePath: '',
                jsFilePath: '',
                dirPath: ''
            })

            await cache.updateCachedFile({
                globalStorage,
                lastDownloadedURLKey: STORAGE_KEY,
                currentURL: ASSET_URL,
                filePath: FILE_PATH
            })

            assert.ok(globalStorage.update.calledWith(STORAGE_KEY, ASSET_URL))
            assert.ok(writeFile.calledWith(FILE_PATH, REQUEST_BODY))
        })

        it('it does not store data when file exists and url for it is same', async () => {
            const globalStorage = {
                update: sinon.spy(),
                get: sinon.stub().returns(ASSET_URL)
            }

            const getFileData = sinon.stub().resolves(REQUEST_BODY)
            const fileExists = sinon
                .stub()
                .onFirstCall()
                .resolves(true)
                .onSecondCall()
                .resolves(true)

            const writeFile = sinon.spy()

            const cache = new StateMachineGraphCache({
                getFileData,
                fileExists,
                writeFile,
                cssFilePath: '',
                jsFilePath: '',
                dirPath: ''
            })

            await cache.updateCachedFile({
                globalStorage,
                lastDownloadedURLKey: STORAGE_KEY,
                currentURL: ASSET_URL,
                filePath: FILE_PATH
            })

            assert.ok(globalStorage.update.notCalled)
            assert.ok(writeFile.notCalled)
        })

        it('creates assets directory when it does not exist', async () => {
            const globalStorage = {
                update: sinon.spy(),
                get: sinon.stub().returns(undefined)
            }

            const getFileData = sinon.stub().resolves(REQUEST_BODY)
            const fileExists = sinon
                .stub()
                .onFirstCall()
                .resolves(false)
                .onSecondCall()
                .resolves(false)

            const writeFile = sinon.spy()
            const makeDir = sinon.spy()

            const dirPath = '/path/to/assets'

            const cache = new StateMachineGraphCache({
                getFileData,
                fileExists,
                writeFile,
                makeDir,
                cssFilePath: '',
                jsFilePath: '',
                dirPath
            })

            await cache.updateCachedFile({
                globalStorage,
                lastDownloadedURLKey: STORAGE_KEY,
                currentURL: ASSET_URL,
                filePath: FILE_PATH
            })

            assert.ok(globalStorage.update.calledWith(STORAGE_KEY, ASSET_URL))
            assert.ok(writeFile.calledWith(FILE_PATH, REQUEST_BODY))
            assert.ok(makeDir.calledWith(dirPath))
        })
    })
})
