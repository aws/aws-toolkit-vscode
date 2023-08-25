/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert from 'assert'
import { DefaultEcrClient, EcrClient, EcrRepository } from '../../../shared/clients/ecrClient'
import { EcrNode } from '../../../ecr/explorer/ecrNode'
import { EcrRepositoryNode } from '../../../ecr/explorer/ecrRepositoryNode'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { EcrTagNode } from '../../../ecr/explorer/ecrTagNode'
import { assertNodeListOnlyHasErrorNode } from '../../utilities/explorerNodeAssertions'

describe('EcrNode', function () {
    let ecr: EcrClient
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        ecr = new DefaultEcrClient('')
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('Gets children and sorts them by repository name', async function () {
        const firstRepo: EcrRepository = { repositoryName: 'name', repositoryArn: 'arn', repositoryUri: 'uri' }
        const secondRepo: EcrRepository = { repositoryName: 'uri', repositoryArn: 'arn', repositoryUri: 'uri' }
        sinon.stub(ecr, 'describeRepositories').callsFake(async function* () {
            yield secondRepo
            yield firstRepo
        })

        const [firstNode, secondNode, ...otherNodes] = await new EcrNode(ecr).getChildren()

        // repos are sorted by the top level node, so first repo should be first even though
        // it is yielded second
        assert.strictEqual((firstNode as EcrRepositoryNode).repository, firstRepo)
        assert.strictEqual(firstNode.label, firstRepo.repositoryName)
        assert.strictEqual((secondNode as EcrRepositoryNode).repository, secondRepo)
        assert.strictEqual(secondNode.label, secondRepo.repositoryName)

        assert.strictEqual(otherNodes.length, 0)
    })

    it('Shows empty node on no children', async function () {
        const stub = sinon.stub(ecr, 'describeRepositories').callsFake(async function* () {})

        const [firstNode, ...otherNodes] = await new EcrNode(ecr).getChildren()

        assert.strictEqual((firstNode as PlaceholderNode).label, '[No repositories found]')

        assert.strictEqual(otherNodes.length, 0)
        assert.ok(stub.calledOnce)
    })

    it('Shows error node when getting children fails', async function () {
        const stub = sinon.stub(ecr, 'describeRepositories').callsFake(async function* () {
            throw Error('network super busted')
            // at least one yield is required for async generator even if it is unreachable
            yield {} as EcrRepository
        })

        const children = await new EcrNode(ecr).getChildren()

        assertNodeListOnlyHasErrorNode(children)
        assert.ok(stub.calledOnce)
    })
})

describe('EcrRepositoryNode', function () {
    const repository: EcrRepository = { repositoryName: 'name', repositoryUri: 'uri', repositoryArn: 'arn' }
    let ecr: EcrClient
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        ecr = new DefaultEcrClient('')
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('Gets children and sorts them by tag name', async function () {
        sinon.stub(ecr, 'describeTags').callsFake(async function* () {
            yield 'ztag'
            yield 'atag'
        })

        const [firstNode, secondNode, ...otherNodes] = await new EcrRepositoryNode(
            {} as EcrNode,
            ecr,
            repository
        ).getChildren()

        // repos are sorted by the top level node, so first node should be first even though
        // it is yielded second
        assert.strictEqual((firstNode as EcrTagNode).repository, repository)
        assert.strictEqual((firstNode as EcrTagNode).tag, 'atag')
        assert.strictEqual(firstNode.label, 'atag')
        assert.strictEqual((secondNode as EcrTagNode).repository, repository)
        assert.strictEqual((secondNode as EcrTagNode).tag, 'ztag')
        assert.strictEqual(secondNode.label, 'ztag')

        assert.strictEqual(otherNodes.length, 0)
    })

    it('Shows empty node on no children', async function () {
        const stub = sinon.stub(ecr, 'describeTags').callsFake(async function* () {})

        const [firstNode, ...otherNodes] = await new EcrRepositoryNode({} as EcrNode, ecr, repository).getChildren()

        assert.strictEqual((firstNode as PlaceholderNode).label, '[No tags found]')

        assert.strictEqual(otherNodes.length, 0)
        assert.ok(stub.calledOnce)
    })

    it('Shows error node when getting children fails', async function () {
        const stub = sinon.stub(ecr, 'describeTags').callsFake(async function* () {
            throw Error('network super busted')
            // at least one yield is required for async generator even if it is unreachable
            yield 'string'
        })

        const children = await new EcrRepositoryNode({} as EcrNode, ecr, repository).getChildren()

        assertNodeListOnlyHasErrorNode(children)
        assert.ok(stub.calledOnce)
    })
})
