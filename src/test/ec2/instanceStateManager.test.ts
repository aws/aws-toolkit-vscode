/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { InstanceStateManager } from '../../ec2/instanceStateManager'
import { Ec2Client } from '../../shared/clients/ec2Client'

describe('InstanceStateManager', async function () {
    class MockEc2Client extends Ec2Client {
        public constructor() {
            super('test-region')
        }

        public override async getInstanceStatus(instanceId: string): Promise<string> {
            return instanceId.split(':')[0]
        }
    }

    class MockInstanceStateManager extends InstanceStateManager {
        protected override getEc2Client(): Ec2Client {
            return new MockEc2Client()
        }

        public async testEnsureInstanceNotInStatus(targetStatus: string) {
            await this.ensureInstanceNotInStatus(targetStatus)
        }
    }

    describe('ensureInstanceNotInStatus', async function () {
        it('only throws error if instance is in status', async function () {
            const stateManager = new MockInstanceStateManager('running:instance', 'test-region')

            await stateManager.testEnsureInstanceNotInStatus('stopped')

            try {
                await stateManager.testEnsureInstanceNotInStatus('running')
                assert.ok(false)
            } catch {}
        })
    })
})
