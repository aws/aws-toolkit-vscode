/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CodeArtifact as CA } from 'aws-sdk'
import { getPackageFullName } from '../../codeartifact/utils'

describe('getPackageFullName', function () {
    it('Returns npm package without scope', function () {
        const artifact: CA.PackageSummary = {
            format: 'npm',
            namespace: '',
            package: 'my-package-name',
        }
        const packageFullName = getPackageFullName(artifact)
        assert.strictEqual(packageFullName, 'my-package-name')
    })

    it('Returns npm package with scope', function () {
        const artifact: CA.PackageSummary = {
            format: 'npm',
            namespace: 'my-scope',
            package: 'my-package-name',
        }
        const packageFullName = getPackageFullName(artifact)
        assert.strictEqual(packageFullName, '@my-scope/my-package-name')
    })

    it('Returns maven package with namespace', function () {
        const artifact: CA.PackageSummary = {
            format: 'maven',
            namespace: 'com.company.framework',
            package: 'my-package-name',
        }
        const packageFullName = getPackageFullName(artifact)
        assert.strictEqual(packageFullName, 'com.company.framework.my-package-name')
    })

    it('Returns nuget package without namespace', function () {
        const artifact: CA.PackageSummary = {
            format: 'nuget',
            namespace: '',
            package: 'com.company.product.my-package-name',
        }
        const packageFullName = getPackageFullName(artifact)
        assert.strictEqual(packageFullName, 'com.company.product.my-package-name')
    })

    it('Returns pypi package without namespace', function () {
        const artifact: CA.PackageSummary = {
            format: 'pypi',
            namespace: '',
            package: 'packagename',
        }
        const packageFullName = getPackageFullName(artifact)
        assert.strictEqual(packageFullName, 'packagename')
    })
})
