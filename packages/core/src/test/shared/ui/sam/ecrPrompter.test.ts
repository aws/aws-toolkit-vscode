/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import * as AwsConsoleModule from '../../../../shared/awsConsole'
import { DefaultEcrClient, EcrRepository } from '../../../../shared/clients/ecrClient'
import { samSyncUrl } from '../../../../shared/constants'
import * as SamUtilsModule from '../../../../shared/sam/utils'
import * as ButtonsModule from '../../../../shared/ui/buttons'
import { createEcrPrompter } from '../../../../shared/ui/sam/ecrPrompter'
import { intoCollection } from '../../../../shared/utilities/collectionUtils'
import { sleep } from '../../../../shared/utilities/timeoutUtils'

describe('createEcrPrompter', () => {
    let sandbox: sinon.SinonSandbox
    const ecrClient = new DefaultEcrClient('us-east-1')
    const mementoRootKey = 'samcli.sync.params'

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('should create a prompter with existing repos', async () => {
        // Arrange
        const ecrRepos: EcrRepository[][] = [
            [
                {
                    repositoryName: 'repo1',
                    repositoryUri: 'repoUri1',
                    repositoryArn: 'repoArn1',
                } as EcrRepository,
                {
                    repositoryName: 'repo2',
                    repositoryUri: 'repoUri2',
                    repositoryArn: 'repoArn2',
                } as EcrRepository,
                {
                    repositoryName: 'repo3',
                    repositoryUri: 'repoUri3',
                    repositoryArn: 'repoArn3',
                } as EcrRepository,
            ],
        ]
        const expectedItems = [
            {
                label: 'repo1',
                data: 'repoUri1',
                detail: 'repoArn1',
                recentlyUsed: false,
            },
            {
                label: 'repo2',
                data: 'repoUri2',
                detail: 'repoArn2',
                recentlyUsed: false,
            },
            {
                label: 'repo3',
                data: 'repoUri3',
                detail: 'repoArn3',
                recentlyUsed: false,
            },
        ]
        const listAllRepositoriesStub = sandbox.stub(ecrClient, 'listAllRepositories').returns(intoCollection(ecrRepos))
        sandbox.stub(SamUtilsModule, 'getRecentResponse').returns(undefined)
        const createCommonButtonsStub = sandbox.stub(ButtonsModule, 'createCommonButtons')
        sandbox
            .stub(AwsConsoleModule, 'getAwsConsoleUrl')
            .returns(vscode.Uri.parse(`https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1`))

        // Act
        const prompter = createEcrPrompter(ecrClient, mementoRootKey)
        await sleep(50)

        // Assert
        assert.ok(createCommonButtonsStub.calledOnce)
        assert.ok(
            createCommonButtonsStub.calledWithExactly(
                samSyncUrl,
                vscode.Uri.parse(`https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1`)
            )
        )
        assert.ok(listAllRepositoriesStub.calledOnce)
        assert.strictEqual(prompter.quickPick.title, 'Select an ECR Repository')
        assert.strictEqual(prompter.quickPick.placeholder, 'Select a repository (or enter a name to create one)')
        assert.strictEqual(prompter.quickPick.items.length, 3)
        assert.deepStrictEqual(prompter.quickPick.items, expectedItems)
    })

    it('should include no items found message if no repos exist', async () => {
        const listAllStacksStub = sandbox.stub(ecrClient, 'listAllRepositories').returns(intoCollection([]))
        sandbox.stub(SamUtilsModule, 'getRecentResponse').returns(undefined)
        const createCommonButtonsStub = sandbox.stub(ButtonsModule, 'createCommonButtons')
        sandbox
            .stub(AwsConsoleModule, 'getAwsConsoleUrl')
            .returns(vscode.Uri.parse(`https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1`))

        // Act
        const prompter = createEcrPrompter(ecrClient, mementoRootKey)
        await sleep(50)

        // Assert
        assert.ok(createCommonButtonsStub.calledOnce)
        assert.ok(
            createCommonButtonsStub.calledWithExactly(
                samSyncUrl,
                vscode.Uri.parse(`https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1`)
            )
        )
        assert.ok(listAllStacksStub.calledOnce)
        assert.strictEqual(prompter.quickPick.title, 'Select an ECR Repository')
        assert.strictEqual(prompter.quickPick.placeholder, 'Select a repository (or enter a name to create one)')
        assert.strictEqual(prompter.quickPick.items.length, 1)
        assert.deepStrictEqual(
            prompter.quickPick.items[0].label,
            'No ECR repositories in region "us-east-1". Enter a name to create a new one.'
        )
        assert.deepStrictEqual(prompter.quickPick.items[0].data, undefined)
    })
})
