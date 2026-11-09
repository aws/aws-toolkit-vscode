/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { fs } from '../../../../shared/fs/fs'
import * as extensionUtilities from '../../../../shared/extensionUtilities'
import {
    initializeResourceMetadata,
    getResourceMetadata,
    resourceMetadataFileExists,
    resetResourceMetadata,
    ResourceMetadata,
} from '../../../../sagemakerunifiedstudio/shared/utils/resourceMetadataUtils'

describe('resourceMetadataUtils', function () {
    let sandbox: sinon.SinonSandbox

    const mockMetadata: ResourceMetadata = {
        AppType: 'JupyterServer',
        DomainId: 'domain-12345',
        SpaceName: 'test-space',
        UserProfileName: 'test-user',
        ExecutionRoleArn: 'arn:aws:iam::123456789012:role/test-role',
        ResourceArn: 'arn:aws:sagemaker:us-west-2:123456789012:app/domain-12345/test-user/jupyterserver/test-app',
        ResourceName: 'test-app',
        AppImageVersion: '1.0.0',
        AdditionalMetadata: {
            DataZoneDomainId: 'dz-domain-123',
            DataZoneDomainRegion: 'us-west-2',
            DataZoneEndpoint: 'https://datazone.us-west-2.amazonaws.com',
            DataZoneEnvironmentId: 'env-123',
            DataZoneProjectId: 'project-456',
            DataZoneScopeName: 'test-scope',
            DataZoneStage: 'prod',
            DataZoneUserId: 'user-789',
            PrivateSubnets: 'subnet-123,subnet-456',
            ProjectS3Path: 's3://test-bucket/project/',
            SecurityGroup: 'sg-123456789',
        },
        ResourceArnCaseSensitive:
            'arn:aws:sagemaker:us-west-2:123456789012:app/domain-12345/test-user/JupyterServer/test-app',
        IpAddressType: 'IPv4',
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        resetResourceMetadata()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('initializeResourceMetadata()', function () {
        it('should initialize metadata when file exists and is valid JSON', async function () {
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(true)
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(JSON.stringify(mockMetadata))

            await initializeResourceMetadata()
            const result = getResourceMetadata()

            assert.deepStrictEqual(result, mockMetadata)
        })

        it('should not initialize when not in SMUS environment', async function () {
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(false)

            await initializeResourceMetadata()
            const result = getResourceMetadata()

            assert.strictEqual(result, undefined)
        })

        it('should not throw when file does not exist', async function () {
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(true)
            sandbox.stub(fs, 'existsFile').resolves(false)

            await initializeResourceMetadata()
            const result = getResourceMetadata()

            assert.strictEqual(result, undefined)
        })

        it('should handle invalid JSON gracefully', async function () {
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(true)
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves('{ invalid json }')

            await initializeResourceMetadata()
            const result = getResourceMetadata()

            assert.strictEqual(result, undefined)
        })

        it('should handle file read errors gracefully', async function () {
            const error = new Error('File read error')
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(true)
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').rejects(error)

            await initializeResourceMetadata()
            const result = getResourceMetadata()

            assert.strictEqual(result, undefined)
        })

        it('should handle metadata with missing optional fields', async function () {
            const minimalMetadata: ResourceMetadata = {
                DomainId: 'domain-123',
            }
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(true)
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(JSON.stringify(minimalMetadata))

            await initializeResourceMetadata()
            const result = getResourceMetadata()

            assert.deepStrictEqual(result, minimalMetadata)
        })

        it('should handle metadata with empty AdditionalMetadata', async function () {
            const metadataWithEmptyAdditional: ResourceMetadata = {
                DomainId: 'domain-123',
                AdditionalMetadata: {},
            }
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(true)
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(JSON.stringify(metadataWithEmptyAdditional))

            await initializeResourceMetadata()
            const result = getResourceMetadata()

            assert.deepStrictEqual(result, metadataWithEmptyAdditional)
        })

        it('should handle empty JSON file', async function () {
            const emptyMetadata: ResourceMetadata = {}
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(true)
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(JSON.stringify(emptyMetadata))

            await initializeResourceMetadata()
            const result = getResourceMetadata()

            assert.deepStrictEqual(result, emptyMetadata)
        })

        it('should handle very large JSON files', async function () {
            const largeMetadata = {
                ...mockMetadata,
                LargeField: 'x'.repeat(10000),
            }
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(true)
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(JSON.stringify(largeMetadata))

            await initializeResourceMetadata()
            const result = getResourceMetadata()

            assert.strictEqual((result as any).LargeField?.length, 10000)
        })

        it('should handle JSON with unexpected additional fields', async function () {
            const metadataWithExtraFields = {
                ...mockMetadata,
                UnexpectedField: 'unexpected-value',
                AdditionalMetadata: {
                    ...mockMetadata.AdditionalMetadata,
                    UnexpectedNestedField: 'unexpected-nested-value',
                },
            }
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(true)
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(JSON.stringify(metadataWithExtraFields))

            await initializeResourceMetadata()
            const result = getResourceMetadata()

            assert.strictEqual((result as any).UnexpectedField, 'unexpected-value')
            assert.strictEqual((result as any).AdditionalMetadata?.UnexpectedNestedField, 'unexpected-nested-value')
        })

        it('should handle JSON with undefined values', async function () {
            const metadataWithUndefined = {
                DomainId: undefined,
                AdditionalMetadata: {
                    DataZoneDomainId: undefined,
                },
            }
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(true)
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(JSON.stringify(metadataWithUndefined))

            await initializeResourceMetadata()
            const result = getResourceMetadata()

            assert.strictEqual(result?.DomainId, undefined)
            assert.strictEqual(result?.AdditionalMetadata?.DataZoneDomainId, undefined)
        })
    })

    describe('getResourceMetadata()', function () {
        it('should return undefined when not initialized', function () {
            const result = getResourceMetadata()
            assert.strictEqual(result, undefined)
        })

        it('should return cached metadata after initialization', async function () {
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(true)
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(JSON.stringify(mockMetadata))

            await initializeResourceMetadata()

            const result = getResourceMetadata()
            assert.deepStrictEqual(result, mockMetadata)
        })

        it('should return the same instance on multiple calls', async function () {
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(true)
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(JSON.stringify(mockMetadata))

            await initializeResourceMetadata()

            const result1 = getResourceMetadata()
            const result2 = getResourceMetadata()

            assert.strictEqual(result1, result2)
            assert.deepStrictEqual(result1, mockMetadata)
        })
    })

    describe('resetResourceMetadata()', function () {
        it('should reset cached metadata and allow re-initialization', async function () {
            sandbox.stub(extensionUtilities, 'isSageMaker').withArgs('SMUS').returns(true)
            const existsFileStub = sandbox.stub(fs, 'existsFile').resolves(true)
            const readFileTextStub = sandbox.stub(fs, 'readFileText').resolves(JSON.stringify(mockMetadata))

            await initializeResourceMetadata()
            const cached1 = getResourceMetadata()
            assert.deepStrictEqual(cached1, mockMetadata)

            sinon.assert.calledOnce(existsFileStub)
            sinon.assert.calledOnce(readFileTextStub)

            resetResourceMetadata()

            const cached2 = getResourceMetadata()
            assert.strictEqual(cached2, undefined)

            await initializeResourceMetadata()
            const cached3 = getResourceMetadata()
            assert.deepStrictEqual(cached3, mockMetadata)

            sinon.assert.calledTwice(existsFileStub)
            sinon.assert.calledTwice(readFileTextStub)
        })
    })

    describe('resourceMetadataFileExists()', function () {
        it('should return true when file exists', async function () {
            const existsStub = sandbox.stub(fs, 'existsFile').resolves(true)

            const result = await resourceMetadataFileExists()

            assert.strictEqual(result, true)
            sinon.assert.calledOnceWithExactly(existsStub, '/opt/ml/metadata/resource-metadata.json')
        })

        it('should return false when file does not exist', async function () {
            sandbox.stub(fs, 'existsFile').resolves(false)

            const result = await resourceMetadataFileExists()

            assert.strictEqual(result, false)
        })

        it('should return false and log error when fs.existsFile throws', async function () {
            const error = new Error('Permission denied')
            sandbox.stub(fs, 'existsFile').rejects(error)

            const result = await resourceMetadataFileExists()

            assert.strictEqual(result, false)
        })
    })
})
