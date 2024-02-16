/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegionSubmenu, RegionSubmenuResponse } from '../shared/ui/common/regionSubmenu'
import { DataQuickPickItem } from '../shared/ui/pickerPrompter'
import { Ec2Client, Ec2Instance } from '../shared/clients/ec2Client'
import { isValidResponse } from '../shared/wizards/wizard'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { AsyncCollection } from '../shared/utilities/asyncCollection'
import { getIconCode } from './utils'

export type instanceFilter = (instance: Ec2Instance) => boolean
export interface Ec2Selection {
    instanceId: string
    region: string
}

export class Ec2Prompter {
    public constructor(protected filter?: instanceFilter) {}

    protected static asQuickPickItem(instance: Ec2Instance): DataQuickPickItem<string> {
        const icon = `$(${getIconCode(instance)})`
        return {
            label: `${icon} \t ${instance.name ?? '(no name)'}`,
            detail: instance.InstanceId,
            data: instance.InstanceId,
        }
    }

    protected static getSelectionFromResponse(response: RegionSubmenuResponse<string>): Ec2Selection {
        return {
            instanceId: response.data,
            region: response.region,
        }
    }

    public async promptUser(): Promise<Ec2Selection> {
        const prompter = this.createEc2ConnectPrompter()
        const response = await prompter.prompt()

        if (isValidResponse(response)) {
            return Ec2Prompter.getSelectionFromResponse(response)
        } else {
            throw new CancellationError('user')
        }
    }

    protected async getInstancesFromRegion(regionCode: string): Promise<AsyncCollection<Ec2Instance>> {
        const client = new Ec2Client(regionCode)
        return await client.getInstances()
    }

    protected async getInstancesAsQuickPickItems(region: string): Promise<DataQuickPickItem<string>[]> {
        return (await this.getInstancesFromRegion(region))
            .filter(this.filter ? instance => this.filter!(instance) : instance => true)
            .map(instance => Ec2Prompter.asQuickPickItem(instance))
            .promise()
    }

    private createEc2ConnectPrompter(): RegionSubmenu<string> {
        return new RegionSubmenu(
            async region => this.getInstancesAsQuickPickItems(region),
            { title: 'Select EC2 Instance', matchOnDetail: true },
            { title: 'Select Region for EC2 Instance' },
            'Instances'
        )
    }
}
