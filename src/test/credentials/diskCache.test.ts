/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as fs from 'fs'
import { fstatSync, writeFileSync } from 'fs-extra'
import { fileExists, makeTemporaryToolkitFolder, tryRemoveFolder } from '../../shared/filesystemUtilities'
import { DiskCache } from '../../credentials/sso/diskCache'
import { SsoClientRegistration } from '../../credentials/sso/ssoClientRegistration'
import { SsoAccessToken } from '../../credentials/sso/ssoAccessToken'

describe('SSO diskCache', () => {
    let tempFolder: string
    const ssoRegion = 'dummyRegion'
    const startUrl = 'https://123456.awsapps.com/start'
    let registrationFilename: string
    let accessTokenFileName: string
    const HOUR_IN_MS = 3600000
    const FOURTEEN_MINS_IN_MS = 840000
    let sut: DiskCache

    const validRegistration: SsoClientRegistration = {
        clientId: 'dummyId',
        clientSecret: 'dummySecret',
        expiresAt: new Date(Date.now() + HOUR_IN_MS).toISOString(),
    }

    const validAccessToken: SsoAccessToken = {
        startUrl: startUrl,
        region: ssoRegion,
        accessToken: 'longstringofrandomcharacters',
        expiresAt: new Date(Date.now() + HOUR_IN_MS).toISOString(),
    }

    beforeEach(async () => {
        // Make a temp folder for all these tests
        tempFolder = await makeTemporaryToolkitFolder()
        registrationFilename = path.join(tempFolder, `aws-toolkit-vscode-client-id-${ssoRegion}.json`)
        accessTokenFileName = path.join(tempFolder, 'c1ac99f782ad92755c6de8647b510ec247330ad1.json')
        sut = new DiskCache(tempFolder)
    })

    afterEach(async () => {
        await tryRemoveFolder(tempFolder)
    })

    describe('loadClientRegistration', () => {
        it('should return a valid registration', () => {
            writeFileSync(registrationFilename, JSON.stringify(validRegistration))

            const returnedRegistration = sut.loadClientRegistration(ssoRegion)

            assert.deepStrictEqual(returnedRegistration, validRegistration)
        })

        it('should return undefined if no registration exists', () => {
            const returnedRegistration = sut.loadClientRegistration(ssoRegion)
            assert.strictEqual(returnedRegistration, undefined)
        })

        it('should return undefined for expired registration', () => {
            const expiredRegistration: SsoClientRegistration = {
                clientId: 'dummyId',
                clientSecret: 'dummySecret',
                expiresAt: new Date(Date.now() - HOUR_IN_MS).toISOString(),
            }

            writeFileSync(registrationFilename, JSON.stringify(expiredRegistration))

            const returnedRegistration = sut.loadClientRegistration(ssoRegion)
            assert.strictEqual(returnedRegistration, undefined)
        })

        it('should return undefined if within 15 minutes from expiration', () => {
            const expiredSoonRegistration: SsoClientRegistration = {
                clientId: 'dummyId',
                clientSecret: 'dummySecret',
                expiresAt: new Date(Date.now() + FOURTEEN_MINS_IN_MS).toISOString(),
            }

            writeFileSync(registrationFilename, JSON.stringify(expiredSoonRegistration))

            const returnedRegistration = sut.loadClientRegistration(ssoRegion)
            assert.strictEqual(returnedRegistration, undefined)
        })
    })
    describe('saveClientRegistration', () => {
        if (process.platform !== 'win32') {
            it('should save the client registration correctly with mode 0600', () => {
                sut.saveClientRegistration(ssoRegion, validRegistration)

                const fileDescriptor = fs.openSync(registrationFilename, 'r')
                const fileStats = fstatSync(fileDescriptor)

                assert.strictEqual(fileStats.mode, 33152)
            })
        }
        it('should save the client registration', async () => {
            sut.saveClientRegistration(ssoRegion, validRegistration)
            assert.strictEqual(await fileExists(registrationFilename), true)
        })
    })

    describe('invalidateClientRegistration', () => {
        it('should delete client registration file', () => {
            writeFileSync(registrationFilename, JSON.stringify(validRegistration))
            assert.notStrictEqual(sut.loadClientRegistration(ssoRegion), undefined)

            sut.invalidateClientRegistration(ssoRegion)
            assert.strictEqual(sut.loadClientRegistration(ssoRegion), undefined)
        })
    })

    describe('loadAccessToken', () => {
        it('should return a valid access token', () => {
            writeFileSync(accessTokenFileName, JSON.stringify(validAccessToken))

            const returnedAccessToken = sut.loadAccessToken(startUrl)

            assert.deepStrictEqual(returnedAccessToken, validAccessToken)
        })

        it('should return undefined if no access token exists', () => {
            const returnedAccessToken = sut.loadAccessToken(startUrl)
            assert.strictEqual(returnedAccessToken, undefined)
        })

        it('should return undefined if expired', () => {
            const expiredAccessToken: SsoAccessToken = {
                startUrl: startUrl,
                region: ssoRegion,
                accessToken: 'longstringofrandomcharacters',
                expiresAt: new Date(Date.now() - HOUR_IN_MS).toISOString(),
            }
            writeFileSync(accessTokenFileName, JSON.stringify(expiredAccessToken))

            const returnedAccessToken = sut.loadAccessToken(startUrl)

            assert.strictEqual(returnedAccessToken, undefined)
        })

        it('should return undefined if expires within 15 minutes from expiration', () => {
            const expiredAccessToken: SsoAccessToken = {
                startUrl: startUrl,
                region: ssoRegion,
                accessToken: 'longstringofrandomcharacters',
                expiresAt: new Date(Date.now() + FOURTEEN_MINS_IN_MS).toISOString(),
            }
            writeFileSync(accessTokenFileName, JSON.stringify(expiredAccessToken))

            const returnedAccessToken = sut.loadAccessToken(startUrl)

            assert.strictEqual(returnedAccessToken, undefined)
        })
    })

    describe('saveAccessToken', () => {
        if (process.platform !== 'win32') {
            it('should save the access token correctly with mode 0600', () => {
                sut.saveAccessToken(startUrl, validAccessToken)

                const fileDescriptor = fs.openSync(accessTokenFileName, 'r')
                const fileStats = fstatSync(fileDescriptor)

                assert.strictEqual(fileStats.mode, 33152)
            })
        }
        it('should save the access token', async () => {
            sut.saveAccessToken(startUrl, validAccessToken)
            assert.strictEqual(await fileExists(accessTokenFileName), true)
        })
    })

    describe('invalidateAccessToken', () => {
        it('should delete the access token file', () => {
            writeFileSync(accessTokenFileName, JSON.stringify(validAccessToken))
            assert.notStrictEqual(sut.loadAccessToken(startUrl), undefined)

            sut.invalidateAccessToken(startUrl)
            assert.strictEqual(sut.loadAccessToken(startUrl), undefined)
        })
    })
})
