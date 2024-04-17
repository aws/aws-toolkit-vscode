/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export default class DependencyVersions {
    public readonly latestVersion: string
    public readonly majorVersions: string[]
    public readonly minorVersions: string[]

    public readonly currentVersion: string

    public readonly allVersions: string[]

    public readonly length: number

    constructor(latestVersion: string, majorVersions: string[], minorVersions: string[], currentVersion: string) {
        this.latestVersion = latestVersion
        this.majorVersions = majorVersions
        this.minorVersions = minorVersions

        this.currentVersion = currentVersion

        this.allVersions = [latestVersion].concat(majorVersions).concat(minorVersions)

        this.length = 1 + this.majorVersions.length + this.minorVersions.length
    }
}
