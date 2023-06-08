/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Wizard } from "../shared/wizards/wizard";
import { RegionSubmenu, RegionSubmenuResponse } from '../shared/ui/common/regionSubmenu'
import { getInstanceIdsFromRegion } from "./commands";
import { DataQuickPickItem, QuickPickPrompter, createQuickPick } from "../shared/ui/pickerPrompter";
import { AsyncCollection } from "../shared/utilities/asyncCollection";

type EC2Selection = {
    instanceId: string 
    regionCode: string
}

type EC2InstanceId = string

type EC2WizardResponse = {
    submenuResponse: RegionSubmenuResponse<EC2InstanceId>
}

function asQuickpickItem(instanceId: string): DataQuickPickItem<string>
{
    return {
        label: instanceId, 
        data: instanceId
    }
}

export function createInstancePrompter(instances: AsyncCollection<EC2InstanceId>): QuickPickPrompter<EC2InstanceId> {
    const items = instances.map(asQuickpickItem).promise()
    const prompter = createQuickPick(items, {title: "Select EC2 instance by id"})

    return prompter
}

function createRegionSubmenu() {
    return new RegionSubmenu(
        async (region) => ((await getInstanceIdsFromRegion(region)).map(asQuickpickItem)).promise(),
        { title: "Select EC2 Instance Id" },
        { title: "Select Region for EC2 Instance" }
    )
}

export class EC2ConnectWizard extends Wizard<EC2WizardResponse> {
    
    public constructor(EC2Selection?: EC2Selection) {
        super({
            initState: {
                submenuResponse: EC2Selection 
                    ? {
                        data: EC2Selection.instanceId, 
                        region: EC2Selection.regionCode,
                      }
                    : undefined,
            },
        })

        this.form.submenuResponse.bindPrompter(createRegionSubmenu)

    }


}
