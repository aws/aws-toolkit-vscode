/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a manifest file containing information about a Maven project.
 * @interface
 * @property {string} pomArtifactId - The artifact ID of the Maven project.
 * @property {string} pomFolderName - The name of the folder containing the POM file.
 * @property {string} hilCapability - The HIL (High-Level Interface) capability of the project.
 * @property {string} pomGroupId - The group ID of the Maven project.
 * @property {string} sourcePomVersion - The version of the source POM file.
 */
export interface IManifestFile {
    pomArtifactId: string
    pomFolderName: string
    hilCapability: string
    pomGroupId: string
    sourcePomVersion: string
}
