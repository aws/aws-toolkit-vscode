/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegionSubmenu, RegionSubmenuResponse } from '../../shared/ui/common/regionSubmenu'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { Ec2Client, Ec2Instance } from '../../shared/clients/ec2'
import { isValidResponse } from '../../shared/wizards/wizard'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { getIconCode } from './utils'
import { Ec2Node } from './explorer/ec2ParentNode'
import { Ec2InstanceNode } from './explorer/ec2InstanceNode'
import { AsyncCollection } from '../../shared/utilities/asyncCollection'

export type InstanceFilter = (instance: Ec2Instance) => boolean
export interface Ec2Selection {
    instanceId: string
    region: string
}

interface Ec2PrompterOptions {
    instanceFilter: InstanceFilter
    getInstancesFromRegion: (regionCode: string) => AsyncCollection<Ec2Instance[]>
}

export class Ec2Prompter {
    protected instanceFilter: InstanceFilter
    protected getInstancesFromRegion: (regionCode: string) => AsyncCollection<Ec2Instance[]>

    public constructor(options?: Partial<Ec2PrompterOptions>) {
        this.instanceFilter = options?.instanceFilter ?? ((_) => true)
        this.getInstancesFromRegion =
            options?.getInstancesFromRegion ?? ((regionCode: string) => new Ec2Client(regionCode).getInstances())
    }

    public static getLabel(instance: Ec2Instance) {
        const icon = `$(${getIconCode(instance)})`
        return `${instance.Name ?? '(no name)'} \t ${icon} ${instance.LastSeenStatus.toUpperCase()}`
    }

    public static asQuickPickItem(instance: Ec2Instance): DataQuickPickItem<string> {
        return {
            label: Ec2Prompter.getLabel(instance),
            detail: instance.InstanceId,
            data: instance.InstanceId,
        }
    }

    public static getSelectionFromResponse(response: RegionSubmenuResponse<string>): Ec2Selection {
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

    public getInstancesAsQuickPickItems(region: string): AsyncIterable<DataQuickPickItem<string>[]> {
        return this.getInstancesFromRegion(region).map((instancePage: Ec2Instance[]) =>
            instancePage.filter(this.instanceFilter).map((i) => Ec2Prompter.asQuickPickItem(i))
        )
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

export async function getSelection(node?: Ec2Node, instanceFilter?: InstanceFilter): Promise<Ec2Selection> {
    const prompter = new Ec2Prompter({ instanceFilter })
    const selection = node && node instanceof Ec2InstanceNode ? node.toSelection() : await prompter.promptUser()
    return selection
}
