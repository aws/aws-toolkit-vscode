/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegionSubmenu, RegionSubmenuResponse } from '../../shared/ui/common/regionSubmenu'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { Ec2Client, PatchedEc2Instance, PatchedReservation } from '../../shared/clients/ec2'
import { isValidResponse } from '../../shared/wizards/wizard'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { getIconCode } from './utils'
import { Ec2Node } from './explorer/ec2ParentNode'
import { Ec2InstanceNode } from './explorer/ec2InstanceNode'
import { AsyncCollection } from '../../shared/utilities/asyncCollection'

export type instanceFilter = (instance: PatchedEc2Instance) => boolean
export interface Ec2Selection {
    instanceId: string
    region: string
}

export class Ec2Prompter {
    public constructor(protected filter?: instanceFilter) {}

    public static getLabel(instance: PatchedEc2Instance) {
        const icon = `$(${getIconCode(instance)})`
        return `${instance.Name ?? '(no name)'} \t ${icon} ${instance.LastSeenStatus.toUpperCase()}`
    }

    protected static asQuickPickItem(instance: PatchedEc2Instance): DataQuickPickItem<string> {
        return {
            label: Ec2Prompter.getLabel(instance),
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

    protected getInstancesFromRegion(regionCode: string): AsyncCollection<PatchedReservation> {
        const client = new Ec2Client(regionCode)
        return client.getReservations()
    }

    protected getInstancesAsQuickPickItems(region: string): AsyncIterable<DataQuickPickItem<string>[]> {
        const reservations = this.getInstancesFromRegion(region)
        const result = reservations.map((r) =>
            r.Instances.filter(this.filter ? (instance) => this.filter!(instance) : (_) => true).map((i) =>
                Ec2Prompter.asQuickPickItem(i)
            )
        )
        return result
    }

    private createEc2ConnectPrompter(): RegionSubmenu<string> {
        return new RegionSubmenu(
            (region) => this.getInstancesAsQuickPickItems(region),
            { title: 'Select EC2 Instance', matchOnDetail: true },
            { title: 'Select Region for EC2 Instance' },
            'Instances'
        )
    }
}

export async function getSelection(node?: Ec2Node, filter?: instanceFilter): Promise<Ec2Selection> {
    const prompter = new Ec2Prompter(filter)
    const selection = node && node instanceof Ec2InstanceNode ? node.toSelection() : await prompter.promptUser()
    return selection
}
