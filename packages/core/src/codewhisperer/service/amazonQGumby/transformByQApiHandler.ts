/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import CodeWhispererUserClient from '../../client/codewhispereruserclient'

export async function downloadResultArchive(jobId: string, artifactId: string, artifactType: string) {
    console.log('Inside downloadResultArchive artifacts', jobId, artifactId, artifactType)
    // /Users/nardeck/workplace/gumby-prod/aws-toolkit-vscode/packages/core/src/amazonqGumby/mock/downloadHilZip/manifest.json
    // src/amazonqGumby/mock/downloadHilZip/manifest.json
    // TODO replace API call
    // 1) Save location on disk for downloaded results
    const manifestFileVirtualFileReference = vscode.Uri.file(
        '/Users/nardeck/workplace/gumby-prod/aws-toolkit-vscode/packages/core/src/amazonqGumby/mock/downloadHilZip/manifest.json'
    )
    const pomFileVirtualFileReference = vscode.Uri.file(
        '/Users/nardeck/workplace/gumby-prod/aws-toolkit-vscode/packages/core/src/amazonqGumby/mock/downloadHilZip/pom.xml'
    )
    return { manifestFileVirtualFileReference, pomFileVirtualFileReference }
}

export async function getTransformationStepsFixture(
    jobId: string
): Promise<CodeWhispererUserClient.TransformationSteps> {
    console.log('In getTransformationStepsFixture', jobId)
    // fake API call to get transformation steps
    return [
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
                },
            ],
            startTime: new Date(),
            endTime: new Date(),
        },
    ]
}
