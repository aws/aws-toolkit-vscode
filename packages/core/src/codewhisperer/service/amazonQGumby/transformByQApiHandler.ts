/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'

export async function downloadResultArchive(jobId: string, artifactId: string, artifactType: string) {
    console.log('Inside downloadResultArchive artifacts', jobId, artifactId, artifactType)
    const manifestFileVirtualFileReference = vscode.Uri.file(
        '/packages/core/src/amazonqGumby/mock/downloadHilZip/manifest.json'
    )
    const pomFileVirtualFileReference = vscode.Uri.file('/packages/core/src/amazonqGumby/mock/downloadHilZip/pom.xml')
    return { manifestFileVirtualFileReference, pomFileVirtualFileReference }
}
