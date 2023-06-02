/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeArtifact as CA } from 'aws-sdk'

export function getPackageFullName(artifact: CA.PackageSummary) {
    let packageFullName: string

    // npm has an optional scope
    if (artifact.format == 'npm') {
        if (artifact.namespace) {
            packageFullName = `@${artifact.namespace}/${artifact.package}`
        } else {
            packageFullName = `${artifact.package}`
        }
    } else if (artifact.format == 'maven') {
        // maven always has a namespace
        packageFullName = `${artifact.namespace}.${artifact.package}`
    } else {
        // python and nuget do not have namespaces
        packageFullName = artifact.package!
    }

    return packageFullName
}
