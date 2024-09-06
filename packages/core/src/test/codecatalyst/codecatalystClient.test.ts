/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon = require('sinon')
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

describe('getFirstPartyRepos()', function () {
    let sandbox: sinon.SinonSandbox
    let codeCatalystClient: codecatalyst.CodeCatalystClient
    let getRepoCloneUrlStub: sinon.SinonStub

    before(function () {
        sandbox = sinon.createSandbox()
    })

    beforeEach(function () {
        codeCatalystClient = <codecatalyst.CodeCatalystClient>{}

        getRepoCloneUrlStub = sandbox.stub()
        codeCatalystClient.getRepoCloneUrl = getRepoCloneUrlStub
    })

    it('removes third party repos', async function () {
        getRepoCloneUrlStub.onCall(0).resolves('https://github.com/aws/not-code-catalyst-1.git')
        getRepoCloneUrlStub.onCall(1).resolves('https://codecatalyst.aws/code-catalyst-1')
        getRepoCloneUrlStub.onCall(2).resolves('https://github.com/aws/not-code-catalyst-2.git')
        getRepoCloneUrlStub.onCall(3).resolves('https://codecatalyst.aws/code-catalyst-1')

        const allRepos = await codecatalyst.excludeThirdPartyRepos(codeCatalystClient, '', '', [
            { name: 'not-code-catalyst-1' },
            { name: 'code-catalyst-1' },
            { name: 'not-code-catalyst-2' },
            { name: 'code-catalyst-2' },
        ])

        assert.deepStrictEqual(allRepos, [{ name: 'code-catalyst-1' }, { name: 'code-catalyst-2' }])
    })

    it('returns empty array if no first party repos', async function () {
        getRepoCloneUrlStub.onCall(0).resolves('https://github.com/aws/aws-cdk.git')
        getRepoCloneUrlStub.onCall(1).resolves('https://github.com/aws/vscode-toolkit.git')

        const allRepos = await codecatalyst.excludeThirdPartyRepos(codeCatalystClient, '', '', [
            { name: 'aws-cdk' },
            { name: 'vscode-toolkit' },
        ])

        assert.deepStrictEqual(allRepos, [])
    })
})
