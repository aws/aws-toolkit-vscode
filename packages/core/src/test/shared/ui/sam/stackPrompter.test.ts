/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import CloudFormation from 'aws-sdk/clients/cloudformation'
import sinon from 'sinon'
import * as vscode from 'vscode'
import * as AwsConsoleModule from '../../../../shared/awsConsole'
import * as SamUtilsModule from '../../../../shared/sam/utils'
import * as ButtonsModule from '../../../../shared/ui/buttons'
import { DefaultCloudFormationClient } from '../../../../shared/clients/cloudFormationClient'
import { samSyncUrl } from '../../../../shared/constants'
import { createStackPrompter } from '../../../../shared/ui/sam/stackPrompter'
import { intoCollection } from '../../../../shared/utilities/collectionUtils'
import { sleep } from '../../../../shared/utilities/timeoutUtils'

describe('createStackPrompter', () => {
    let sandbox: sinon.SinonSandbox
    const cfnClient = new DefaultCloudFormationClient('us-east-1')
    const mementoRootKey = 'samcli.sync.params'

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('should create a prompter with existing stacks', async () => {
        // Arrange
        const stackSummaries: CloudFormation.StackSummary[][] = [
            [
                {
                    StackName: 'stack1',
                    StackStatus: 'CREATE_COMPLETE',
                    CreationTime: new Date(),
                } as CloudFormation.StackSummary,
                {
                    StackName: 'stack2',
                    StackStatus: 'CREATE_COMPLETE',
                    CreationTime: new Date(),
                } as CloudFormation.StackSummary,
                {
                    StackName: 'stack3',
                    StackStatus: 'CREATE_COMPLETE',
                    CreationTime: new Date(),
                } as CloudFormation.StackSummary,
            ],
        ]
        const expectedItems = [
            {
                label: 'stack1',
                data: 'stack1',
                description: undefined,
                invalidSelection: false,
                recentlyUsed: false,
            },
            {
                label: 'stack2',
                data: 'stack2',
                description: undefined,
                invalidSelection: false,
                recentlyUsed: false,
            },
            {
                label: 'stack3',
                data: 'stack3',
                description: undefined,
                invalidSelection: false,
                recentlyUsed: false,
            },
        ]
        const listAllStacksStub = sandbox.stub(cfnClient, 'listAllStacks').returns(intoCollection(stackSummaries))
        sandbox.stub(SamUtilsModule, 'getRecentResponse').returns(undefined)
        const createCommonButtonsStub = sandbox.stub(ButtonsModule, 'createCommonButtons')
        sandbox
            .stub(AwsConsoleModule, 'getAwsConsoleUrl')
            .returns(vscode.Uri.parse(`https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1`))

        // Act
        const prompter = createStackPrompter(cfnClient, mementoRootKey, samSyncUrl)
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
        assert.strictEqual(prompter.quickPick.title, 'Select a CloudFormation Stack')
        assert.strictEqual(prompter.quickPick.placeholder, 'Select a stack (or enter a name to create one)')
        assert.strictEqual(prompter.quickPick.items.length, 3)
        assert.deepStrictEqual(prompter.quickPick.items, expectedItems)
    })

    it('should include no items found message if no stacks exist', async () => {
        const listAllStacksStub = sandbox.stub(cfnClient, 'listAllStacks').returns(intoCollection([]))
        sandbox.stub(SamUtilsModule, 'getRecentResponse').returns(undefined)
        const createCommonButtonsStub = sandbox.stub(ButtonsModule, 'createCommonButtons')
        sandbox
            .stub(AwsConsoleModule, 'getAwsConsoleUrl')
            .returns(vscode.Uri.parse(`https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1`))

        // Act
        const prompter = createStackPrompter(cfnClient, mementoRootKey, samSyncUrl)
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
        assert.strictEqual(prompter.quickPick.title, 'Select a CloudFormation Stack')
        assert.strictEqual(prompter.quickPick.placeholder, 'Select a stack (or enter a name to create one)')
        assert.strictEqual(prompter.quickPick.items.length, 1)
        assert.deepStrictEqual(
            prompter.quickPick.items[0].label,
            'No stacks in region "us-east-1". Enter a name to create a new one.'
        )
        assert.deepStrictEqual(prompter.quickPick.items[0].data, undefined)
    })
})
