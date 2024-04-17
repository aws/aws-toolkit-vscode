/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export default class DependencyVersions {
    public readonly latestVersion: string
    public readonly majorVersions: string[]
    public readonly minorVersions: string[]

    public readonly allVersions: string[]

    public readonly length: number

    constructor(latestVersion: string, majorVersions: string[], minorVersions: string[]) {
        this.latestVersion = latestVersion
        this.majorVersions = majorVersions
        this.minorVersions = minorVersions

        this.allVersions = [latestVersion]
        this.allVersions.concat(majorVersions)
        this.allVersions.concat(minorVersions)

        this.length = 1 + this.majorVersions.length + this.minorVersions.length
    }
}
