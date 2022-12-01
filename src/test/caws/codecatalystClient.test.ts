/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { toCodeCatalystUrl } from '../../codecatalyst/utils'
import * as codecatalyst from '../../shared/clients/codecatalystClient'

describe('codeCatalystClient', function () {
    it('toCodeCatalystUrl()', async function () {
        const org: codecatalyst.CodeCatalystOrg = {
            type: 'org',
            name: 'org1',
            regionName: 'region',
        }
        const project: codecatalyst.CodeCatalystProject = {
            type: 'project',
            org: org,
            name: 'project1',
        }
        const repo: codecatalyst.CodeCatalystRepo = {
            type: 'repo',
            org: org,
            project: project,
            id: 'repoid1',
            name: 'repo1',
            lastUpdatedTime: new Date(),
            createdTime: new Date(),
        }
        const prefix = `https://${codecatalyst.getCodeCatalystConfig().hostname}/spaces`
        assert.deepStrictEqual(toCodeCatalystUrl(org), `${prefix}/org1/view`)
        assert.deepStrictEqual(toCodeCatalystUrl(project), `${prefix}/org1/projects/project1/view`)
        assert.deepStrictEqual(
            toCodeCatalystUrl(repo),
            `${prefix}/org1/projects/project1/source-repositories/repo1/view`
        )
    })
})
