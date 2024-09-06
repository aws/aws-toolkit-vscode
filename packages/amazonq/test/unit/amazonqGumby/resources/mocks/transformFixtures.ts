/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TransformationStep } from 'aws-core-vscode/codewhisperer/node'

export const downloadArtifactIdFixture = 'hil-test-artifact-id'
export const downloadArtifactTypeFixture = 'BuiltJars'
export const transformationStepsHumanInTheLoopFixture: TransformationStep[] = [
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
                        downloadArtifactId: downloadArtifactIdFixture,
                        downloadArtifactType: downloadArtifactTypeFixture,
                    },
                ],
            },
        ],
        startTime: new Date(),
        endTime: new Date(),
    },
]
