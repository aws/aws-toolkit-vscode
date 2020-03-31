/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import {
    PublishStateMachineAction,
    PublishStateMachineWizard,
    PublishStateMachineWizardContext,
    PublishStateMachineWizardResponse,
} from '../../../stepFunctions/wizards/publishStateMachineWizard'

describe('PublishStateMachineWizard', async () => {
    describe('PUBLISH_ACTION', async () => {
        it('exits when cancelled', async () => {
            const context: PublishStateMachineWizardContext = new MockPublishStateMachineWizardContext()
            const wizard = new PublishStateMachineWizard(context)
            const result: PublishStateMachineWizardResponse | undefined = await wizard.run()

            assert.ok(!result)
        })
    })

    describe('Quick create', async () => {
        it('exits gracefully if cancelled', async () => {
            const roleArn: string = 'arn:aws:iam::123456789012:role/myRole'
            const context: PublishStateMachineWizardContext = new MockPublishStateMachineWizardContext(
                [PublishStateMachineAction.QuickCreate],
                [roleArn],
                undefined
            )
            const wizard = new PublishStateMachineWizard(context)
            const result: PublishStateMachineWizardResponse | undefined = await wizard.run()

            assert.ok(!result)
        })

        it('returns create response when completed', async () => {
            const name: string = 'myStateMachine'
            const roleArn: string = 'arn:aws:iam::123456789012:role/myRole'
            const context: PublishStateMachineWizardContext = new MockPublishStateMachineWizardContext(
                [PublishStateMachineAction.QuickCreate],
                [roleArn],
                [name]
            )
            const wizard = new PublishStateMachineWizard(context)
            const result: PublishStateMachineWizardResponse | undefined = await wizard.run()

            assert.ok(!result!.updateResponse, 'Wizard should not return updateResponse for create action')
            assert.strictEqual(result!.createResponse?.name, name)
            assert.strictEqual(result!.createResponse?.roleArn, roleArn)
        })
    })

    describe('Quick update', async () => {
        it('exits gracefully if cancelled', async () => {
            const context: PublishStateMachineWizardContext = new MockPublishStateMachineWizardContext([
                PublishStateMachineAction.QuickUpdate,
            ])
            const wizard = new PublishStateMachineWizard(context)
            const result: PublishStateMachineWizardResponse | undefined = await wizard.run()

            assert.ok(!result)
        })

        it('returns update response when completed', async () => {
            const stateMachineArn: string = 'arn:aws:states:us-east-1:123456789012:stateMachine:myStateMachine'
            const context: PublishStateMachineWizardContext = new MockPublishStateMachineWizardContext(
                [PublishStateMachineAction.QuickUpdate],
                undefined,
                undefined,
                [stateMachineArn]
            )
            const wizard = new PublishStateMachineWizard(context)
            const result: PublishStateMachineWizardResponse | undefined = await wizard.run()

            assert.ok(!result!.createResponse, 'Wizard should not return createResponse for update action')
            assert.strictEqual(result!.updateResponse?.stateMachineArn, stateMachineArn)
        })
    })
})

class MockPublishStateMachineWizardContext implements PublishStateMachineWizardContext {
    public constructor(
        private readonly publishAction?: PublishStateMachineAction[],
        private readonly iamRoleArn?: string[],
        private readonly stateMachineName?: string[],
        private readonly stateMachineArn?: string[]
    ) {}

    public async promptUserForStateMachineToUpdate(): Promise<string | undefined> {
        return this.stateMachineArn?.shift()
    }

    public async promptUserForPublishAction(
        publishAction: PublishStateMachineAction | undefined
    ): Promise<PublishStateMachineAction | undefined> {
        return this.publishAction?.shift()
    }

    public async promptUserForStateMachineName(): Promise<string | undefined> {
        return this.stateMachineName?.shift()
    }

    public async promptUserForIamRole(currRoleArn?: string | undefined): Promise<string | undefined> {
        return this.iamRoleArn?.shift()
    }

    public async loadIamRoles(): Promise<void> {}
    public async loadStateMachines(): Promise<void> {}
}
