/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-restricted-imports */
import * as assert from 'assert'
import { parseArn, writeMapping, readMapping } from '../../../../awsService/sagemaker/detached-server/utils'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { SpaceMappings } from '../../../../awsService/sagemaker/types'

describe('parseArn', () => {
    it('parses a standard SageMaker ARN with forward slash', () => {
        const arn = 'arn:aws:sagemaker:us-west-2:123456789012:space/domain-name/my-space-name'
        const result = parseArn(arn)
        assert.deepStrictEqual(result, {
            region: 'us-west-2',
            accountId: '123456789012',
            spaceName: 'my-space-name',
        })
    })

    it('parses an ARN prefixed with sagemaker-user@', () => {
        const arn = 'sagemaker-user@arn:aws:sagemaker:ap-southeast-1:123456789012:space/foo/my-space-name'
        const result = parseArn(arn)
        assert.deepStrictEqual(result, {
            region: 'ap-southeast-1',
            accountId: '123456789012',
            spaceName: 'my-space-name',
        })
    })

    it('throws on malformed ARN', () => {
        const invalidArn = 'arn:aws:invalid:format'
        assert.throws(() => parseArn(invalidArn), /Invalid SageMaker ARN format/)
    })

    it('throws when missing region/account', () => {
        const invalidArn = 'arn:aws:sagemaker:::space/xyz'
        assert.throws(() => parseArn(invalidArn), /Invalid SageMaker ARN format/)
    })
})

describe('writeMapping', () => {
    let testDir: string

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sagemaker-test-'))
    })

    afterEach(async () => {
        await fs.rmdir(testDir, { recursive: true })
    })

    it('handles concurrent writes without race conditions', async () => {
        const mapping1: SpaceMappings = {
            localCredential: {
                'space-1': { type: 'iam', profileName: 'profile1' },
            },
        }
        const mapping2: SpaceMappings = {
            localCredential: {
                'space-2': { type: 'iam', profileName: 'profile2' },
            },
        }
        const mapping3: SpaceMappings = {
            deepLink: {
                'space-3': {
                    requests: {
                        req1: {
                            sessionId: 'session-456',
                            url: 'wss://example3.com',
                            token: 'token-456',
                        },
                    },
                    refreshUrl: 'https://example3.com/refresh',
                },
            },
        }

        const writePromises = [writeMapping(mapping1), writeMapping(mapping2), writeMapping(mapping3)]

        await Promise.all(writePromises)

        const finalContent = await readMapping()
        const possibleResults = [mapping1, mapping2, mapping3]
        const isValidResult = possibleResults.some(
            (expected) => JSON.stringify(finalContent) === JSON.stringify(expected)
        )
        assert.strictEqual(isValidResult, true, 'Final content should match one of the written mappings')
    })

    it('queues multiple writes and processes them sequentially', async () => {
        const mappings = Array.from({ length: 5 }, (_, i) => ({
            localCredential: {
                [`space-${i}`]: { type: 'iam' as const, profileName: `profile-${i}` },
            },
        }))

        const writePromises = mappings.map((mapping) => writeMapping(mapping))

        await Promise.all(writePromises)

        const finalContent = await readMapping()
        assert.strictEqual(typeof finalContent, 'object', 'Final content should be a valid object')

        const isValidResult = mappings.some((mapping) => JSON.stringify(finalContent) === JSON.stringify(mapping))
        assert.strictEqual(isValidResult, true, 'Final content should match one of the written mappings')
    })
})
