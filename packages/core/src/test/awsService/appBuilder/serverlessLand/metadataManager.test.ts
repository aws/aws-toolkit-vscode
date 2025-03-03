/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MetadataManager } from '../../../../awsService/appBuilder/serverlessLand/metadataManager'
import globals from '../../../../shared/extensionGlobals'
import path from 'path'
import assert from 'assert'
import * as sinon from 'sinon'

describe('MetadataManager', () => {
    let sandbox: sinon.SinonSandbox
    let manager: MetadataManager

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        manager = MetadataManager.getInstance()
        ;(manager as any).metadata = {
            patterns: {
                testPattern: {
                    implementation: [
                        { iac: 'SAM', runtime: 'nodejs18.x', assetName: 'asset1' },
                        { iac: 'CDK', runtime: 'nodejs18.x', assetName: 'asset2' },
                        { iac: 'SAM', runtime: 'python3.9', assetName: 'asset3' },
                    ],
                },
            },
        }
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('getInstance', () => {
        it('should create a new instance when none exists', () => {
            const instance1 = MetadataManager.getInstance()
            assert(instance1 instanceof MetadataManager)
        })

        it('should return the same instance when called multiple times', () => {
            const instance1 = MetadataManager.getInstance()
            const instance2 = MetadataManager.getInstance()
            assert.strictEqual(instance1, instance2)
        })
    })
    describe('initialize', () => {
        it('should initialize metadata manager and return instance', async () => {
            const mockPath = '/mock/path/metadata.json'
            const loadMetadataStub = sandbox.stub().resolves(undefined)

            const getMetadataPathStub = sandbox.stub(MetadataManager.prototype, 'getMetadataPath').returns(mockPath)

            sandbox.stub(MetadataManager.prototype as any, 'loadMetadata').callsFake(loadMetadataStub)

            const instance = MetadataManager.initialize()

            assert(instance instanceof MetadataManager)
            sinon.assert.calledOnce(getMetadataPathStub)
            sinon.assert.calledWith(loadMetadataStub, mockPath)
        })
    })

    describe('getMetadataPath', () => {
        it('should return correct metadata path', () => {
            const mockAbsolutePath = '/absolute/path'
            const asAbsolutePathStub = sandbox.stub().returns(mockAbsolutePath)

            sandbox.stub(globals, 'context').value({
                asAbsolutePath: asAbsolutePathStub,
            })

            const instance = MetadataManager.getInstance()
            const result = instance.getMetadataPath()

            sinon.assert.calledWith(asAbsolutePathStub, path.join('dist', 'src', 'serverlessLand', 'metadata.json'))
            assert.strictEqual(result, mockAbsolutePath)
        })
    })

    describe('getPatterns', () => {
        let manager: MetadataManager
        beforeEach(() => {
            manager = MetadataManager.getInstance()
        })
        it('handles different pattern data types', () => {
            ;(manager as any).metadata = {
                patterns: {
                    pattern1: { name: 'test', description: 'object description' },
                },
            }
            assert.deepStrictEqual(manager.getPatterns(), [{ label: 'pattern1', description: 'object description' }])
        })
    })

    describe('getRuntimes', () => {
        it('returns empty array when pattern not found', () => {
            assert.deepStrictEqual(manager.getRuntimes('nonexistent'), [])
        })

        it('returns unique runtimes for valid pattern', () => {
            assert.deepStrictEqual(manager.getRuntimes('testPattern'), [
                { label: 'nodejs18.x' },
                { label: 'python3.9' },
            ])
        })
    })

    describe('getUrl', () => {
        it('returns empty string when pattern not found', () => {
            assert.strictEqual(manager.getUrl('nonexistent'), '')
        })

        it('returns correct URL for valid pattern', () => {
            assert.strictEqual(manager.getUrl('testPattern'), 'https://serverlessland.com/patterns/asset1')
        })
    })

    describe('getIacOptions', () => {
        it('returns empty array when pattern not found', () => {
            assert.deepStrictEqual(manager.getIacOptions('nonexistent'), [])
        })

        it('returns unique IAC options for valid pattern', () => {
            assert.deepStrictEqual(manager.getIacOptions('testPattern'), [{ label: 'SAM' }, { label: 'CDK' }])
        })
    })

    describe('getAssetName', () => {
        it('returns empty string when pattern not found', () => {
            assert.strictEqual(manager.getAssetName('nonexistent', 'nodejs18.x', 'SAM'), '')
        })

        it('returns correct asset name for matching implementation', () => {
            assert.strictEqual(manager.getAssetName('testPattern', 'nodejs18.x', 'SAM'), 'asset1')
        })

        it('returns empty string when no matching implementation found', () => {
            assert.strictEqual(manager.getAssetName('testPattern', 'java11', 'SAM'), '')
        })
    })
})
