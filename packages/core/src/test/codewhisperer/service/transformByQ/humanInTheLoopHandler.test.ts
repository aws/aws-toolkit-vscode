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

describe('Amazon Q Gumby Human In The Loop Handler', function () {
    describe('parseXmlDependenciesReport', function () {
        it('Will return parsed values', async function () {
            const testXmlReport = `
            <?xml version="1.0" encoding="UTF-8"?>
                <DependencyUpdatesReport xsi:schemaLocation="https://www.mojohaus.org/VERSIONS/DEPENDENCY-UPDATES-REPORT/2.0.0 https://www.mojohaus.org/versions/versions-model-report/xsd/dependency-updates-report-2.0.0.xsd"
                    xmlns="https://www.mojohaus.org/VERSIONS/DEPENDENCY-UPDATES-REPORT/2.0.0"
                    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                <summary>
                    <usingLastVersion>0</usingLastVersion>
                    <nextVersionAvailable>0</nextVersionAvailable>
                    <nextIncrementalAvailable>1</nextIncrementalAvailable>
                    <nextMinorAvailable>0</nextMinorAvailable>
                    <nextMajorAvailable>0</nextMajorAvailable>
                </summary>
                <dependencies>
                    <dependency>
                    <groupId>org.projectlombok</groupId>
                    <artifactId>lombok</artifactId>
                    <scope>compile</scope>
                    <type>jar</type>
                    <currentVersion>0.11.4</currentVersion>
                    <lastVersion>1.18.32</lastVersion>
                    <incrementals>
                        <incremental>0.11.6</incremental>
                        <incremental>0.11.8</incremental>
                    </incrementals>
                    <minors>
                        <minor>0.12.0</minor>
                    </minors>
                    <majors>
                        <major>1.12.2</major>
                        <major>1.12.4</major>
                        <major>1.12.6</major>
                    </majors>
                    <status>incremental available</status>
                    </dependency>
                </dependencies>
                </DependencyUpdatesReport>
                `
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
})
