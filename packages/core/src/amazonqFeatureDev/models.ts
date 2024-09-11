/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a manifest file with information about a Maven project.
 */
export interface IManifestFile {
    pomArtifactId: string
    pomFolderName: string
    hilCapability: string
    pomGroupId: string
    sourcePomVersion: string
}
