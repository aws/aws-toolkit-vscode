/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export default class DependencyVersions {
    public readonly latestVersion: string
    public readonly majorVersions: string[]
    public readonly minorVersions: string[]

    public readonly currentVersion: string

    public readonly allVersions: Set<string>

    public readonly length: number

    constructor(latestVersion: string, majorVersions: string[], minorVersions: string[], currentVersion: string) {
        this.latestVersion = latestVersion
        this.majorVersions = majorVersions.sort()
        this.minorVersions = minorVersions.sort()

        this.currentVersion = currentVersion

        // Note: Set preserves insertion order
        this.allVersions = new Set<string>(majorVersions.concat(minorVersions))

        this.length = this.allVersions.size
    }
}
