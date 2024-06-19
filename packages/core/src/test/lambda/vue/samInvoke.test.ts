/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { finalizeConfig } from '../../../lambda/vue/configEditor/samInvokeBackend'
import { AwsSamDebuggerConfiguration } from '../../../shared/sam/debugger/awsSamDebugConfiguration'

describe('Sam Invoke Vue Backend', () => {
    describe('finalizeConfig', () => {
        it('prunes configs correctly', () => {
            const configs: { input: AwsSamDebuggerConfiguration; output: AwsSamDebuggerConfiguration }[] = [
                {
                    input: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'noprune',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                    },
                    output: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'noprune',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                    },
                },
                {
                    input: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        lambda: {
                            payload: {
                                json: {},
                            },
                        },
                        name: 'prunejson',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                    },
                    output: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'prunejson',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                    },
                },
                {
                    input: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'prunestr',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                        lambda: {
                            runtime: '',
                        },
                    },
                    output: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'prunestr',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                    },
                },
                {
                    input: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'prunearr',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                        lambda: {
                            pathMappings: [],
                        },
                    },
                    output: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'prunearr',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                    },
                },
            ]

            for (const config of configs) {
                assert.deepStrictEqual(
                    finalizeConfig(config.input, config.input.name),
                    config.output,
                    `Test failed for input: ${config.input.name}`
                )
            }
        })
    })
})
