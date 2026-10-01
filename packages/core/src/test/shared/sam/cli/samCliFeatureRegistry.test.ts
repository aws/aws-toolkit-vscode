/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { detectFeaturesInTemplate } from '../../../../shared/sam/cli/samCliFeatureRegistry'
import * as samUtils from '../../../../shared/sam/utils'

describe('samCliFeatureRegistry', () => {
    let sandbox: sinon.SinonSandbox
    let getSamCliPathAndVersionStub: sinon.SinonStub

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        getSamCliPathAndVersionStub = sandbox.stub(samUtils, 'getSamCliPathAndVersion')
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('detectFeaturesInTemplate', () => {
        const testCases = [
            {
                name: 'should detect Capacity Provider resource type when version is unsupported',
                samVersion: '1.148.0',
                template: {
                    Resources: {
                        MyCapacityProvider: {
                            Type: 'AWS::Serverless::CapacityProvider',
                            Properties: {},
                        },
                    },
                },
                expectedCount: 1,
                expectedIds: ['CAPACITY_PROVIDER'],
            },
            {
                name: 'should return empty array when SAM CLI version meets all requirements',
                samVersion: '1.149.0',
                template: {
                    Resources: {
                        MyCapacityProvider: {
                            Type: 'AWS::Serverless::CapacityProvider',
                            Properties: {},
                        },
                    },
                },
                expectedCount: 0,
                expectedIds: [],
            },
            {
                name: 'should return empty array when SAM CLI version exceeds all requirements',
                samVersion: '2.0.0',
                template: {
                    Resources: {
                        MyCapacityProvider: {
                            Type: 'AWS::Serverless::CapacityProvider',
                            Properties: {},
                        },
                    },
                },
                expectedCount: 0,
                expectedIds: [],
            },
            {
                name: 'should detect CapacityProviderConfig property on Function',
                samVersion: '1.148.0',
                template: {
                    Resources: {
                        MyFunction: {
                            Type: 'AWS::Serverless::Function',
                            Properties: {
                                CapacityProviderConfig: 'MyCapacityProvider',
                            },
                        },
                    },
                },
                expectedCount: 1,
                expectedIds: ['CAPACITY_PROVIDER_CONFIG'],
            },
            {
                name: 'should detect CapacityProviderConfig in Globals',
                samVersion: '1.148.0',
                template: {
                    Globals: {
                        Function: {
                            CapacityProviderConfig: 'MyCapacityProvider',
                        },
                    },
                    Resources: {},
                },
                expectedCount: 1,
                expectedIds: ['CAPACITY_PROVIDER_CONFIG'],
            },
            {
                name: 'should detect multiple features',
                samVersion: '1.148.0',
                template: {
                    Resources: {
                        MyCapacityProvider: {
                            Type: 'AWS::Serverless::CapacityProvider',
                            Properties: {},
                        },
                        MyFunction: {
                            Type: 'AWS::Serverless::Function',
                            Properties: {
                                CapacityProviderConfig: 'MyCapacityProvider',
                            },
                        },
                    },
                },
                expectedCount: 2,
                expectedIds: ['CAPACITY_PROVIDER', 'CAPACITY_PROVIDER_CONFIG'],
            },
            {
                name: 'should not detect duplicate features',
                samVersion: '1.148.0',
                template: {
                    Resources: {
                        MyFunction1: {
                            Type: 'AWS::Serverless::Function',
                            Properties: {
                                CapacityProviderConfig: 'MyCapacityProvider',
                            },
                        },
                        MyFunction2: {
                            Type: 'AWS::Serverless::Function',
                            Properties: {
                                CapacityProviderConfig: 'MyCapacityProvider',
                            },
                        },
                    },
                },
                expectedCount: 1,
                expectedIds: ['CAPACITY_PROVIDER_CONFIG'],
            },
            {
                name: 'should return empty array for template without special features',
                samVersion: '1.148.0',
                template: {
                    Resources: {
                        MyFunction: {
                            Type: 'AWS::Serverless::Function',
                            Properties: {
                                Runtime: 'nodejs18.x',
                            },
                        },
                    },
                },
                expectedCount: 0,
                expectedIds: [],
            },
            {
                name: 'should handle empty template',
                samVersion: '1.148.0',
                template: {},
                expectedCount: 0,
                expectedIds: [],
            },
        ]

        for (const { name, samVersion, template, expectedCount, expectedIds } of testCases) {
            it(name, async () => {
                getSamCliPathAndVersionStub.resolves({ path: '/path/to/sam', parsedVersion: samVersion })

                const { unsupported, version } = await detectFeaturesInTemplate(template)

                assert.strictEqual(version, samVersion)
                assert.strictEqual(unsupported.length, expectedCount)
                for (const id of expectedIds) {
                    assert(unsupported.some((f) => f.id === id))
                }
            })
        }
    })
})
