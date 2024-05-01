/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { parseVersionsListFromPomFile } from '../../../../codewhisperer/service/transformByQ/transformFileHandler'
import {
    TransformationProgressUpdate,
    TransformationStep,
} from '../../../../codewhisperer/client/codewhispereruserclient'
import {
    findDownloadArtifactStep,
    getArtifactsFromProgressUpdate,
} from '../../../../codewhisperer/service/transformByQ/transformApiHandler'
import { fsCommon } from '../../../../srcShared/fs'

describe('Amazon Q Gumby Human In The Loop Handler', function () {
    describe('parseXmlDependenciesReport', function () {
        it('Will return parsed values', async function () {
            const testXmlReport = await fsCommon.readFileAsString('../files/dependency-report.xml')
            const { latestVersion, majorVersions, minorVersions, status } = await parseVersionsListFromPomFile(
                testXmlReport
            )

            assert.strictEqual(latestVersion, '1.18.32')
            assert.strictEqual(minorVersions[0], '0.12.0')
            assert.strictEqual(majorVersions[0], '1.12.2')
            assert.strictEqual(status, 'incremental available')
        })
    })
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
    // describe('initiateHumanInTheLoopPrompt', function () {
    //     it('will delete dependencies', function () {
    //         const downloadArtifactId = 'hil-test-artifact-id'
    //         const downloadArtifactType = 'BuiltJars'
    //         const transformationStepsFixture: TransformationProgressUpdate = {
    //             name: 'Status step',
    //             status: 'FAILED',
    //             description: 'This step should be hil identifier',
    //             startTime: new Date(),
    //             endTime: new Date(),
    //             downloadArtifacts: [
    //                 {
    //                     downloadArtifactId,
    //                     downloadArtifactType,
    //                 },
    //             ],
    //         }
    //         const snippet = getCodeIssueSnippetFromPom()

    //         assert.strictEqual(snippet, downloadArtifactId)
    //     })
    // })
})
