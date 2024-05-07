/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { TransformationProgressUpdate, TransformationStep } from '../../codewhisperer/client/codewhispereruserclient'
import {
    findDownloadArtifactStep,
    getArtifactsFromProgressUpdate,
} from '../../codewhisperer/service/transformByQ/transformApiHandler'

describe('Amazon Q Transform - transformApiHandler tests', function () {
    describe('getArtifactIdentifiers', function () {
        it('will return downloaded artifact values from transformationStep', function () {
            const downloadArtifactId = 'hil-test-artifact-id'
            const downloadArtifactType = 'BuiltJars'
            const transformationStepsFixture: TransformationProgressUpdate = {
                name: 'Status step',
                status: 'FAILED',
                description: 'This step should be hil identifier',
                startTime: new Date(),
                endTime: new Date(),
                downloadArtifacts: [
                    {
                        downloadArtifactId,
                        downloadArtifactType,
                    },
                ],
            }
            const { artifactId, artifactType } = getArtifactsFromProgressUpdate(transformationStepsFixture)

            assert.strictEqual(artifactId, downloadArtifactId)
            assert.strictEqual(artifactType, downloadArtifactType)
        })
    })
    describe('findDownloadArtifactStep', function () {
        it('will return downloaded artifact values from transformationStep', function () {
            const downloadArtifactId = 'hil-test-artifact-id'
            const downloadArtifactType = 'BuiltJars'
            const transformationStepsFixture: TransformationStep[] = [
                {
                    id: 'fake-step-id-1',
                    name: 'Building Code',
                    description: 'Building dependencies',
                    status: 'COMPLETED',
                    progressUpdates: [
                        {
                            name: 'Status step',
                            status: 'FAILED',
                            description: 'This step should be hil identifier',
                            startTime: new Date(),
                            endTime: new Date(),
                            downloadArtifacts: [
                                {
                                    downloadArtifactId,
                                    downloadArtifactType,
                                },
                            ],
                        },
                    ],
                    startTime: new Date(),
                    endTime: new Date(),
                },
            ]
            const { transformationStep, progressUpdate } = findDownloadArtifactStep(transformationStepsFixture)

            assert.strictEqual(transformationStep, transformationStepsFixture[0])
            assert.strictEqual(progressUpdate, transformationStepsFixture[0].progressUpdates?.[0])
        })
        it('will return undefined if no downloadArtifactId found', function () {
            const transformationStepsFixture: TransformationStep[] = [
                {
                    id: 'fake-step-id-1',
                    name: 'Building Code',
                    description: 'Building dependencies',
                    status: 'COMPLETED',
                    progressUpdates: [
                        {
                            name: 'Status step',
                            status: 'FAILED',
                            description: 'This step should be hil identifier',
                            startTime: new Date(),
                            endTime: new Date(),
                            downloadArtifacts: undefined,
                        },
                    ],
                    startTime: new Date(),
                    endTime: new Date(),
                },
            ]
            const { transformationStep, progressUpdate } = findDownloadArtifactStep(transformationStepsFixture)

            assert.strictEqual(transformationStep, undefined)
            assert.strictEqual(progressUpdate, undefined)
        })
    })
})
