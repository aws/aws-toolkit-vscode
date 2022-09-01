/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as settings from './parameterDescriptions.json'
import { createQuickPick, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { createInputBox, InputBoxPrompter } from '../../shared/ui/inputPrompter'
import { Prompter } from '../../shared/ui/prompter'
import { toTitleCase } from '../../shared/utilities/textUtilities'

export type InstanceType = keyof typeof workspaceOptions['instanceType']
interface InstanceDescription {
    name: string
    specs: string
}

const workspaceOptions = settings['environment']

function entries<T extends Record<string, any>, K extends keyof T = keyof T & string>(obj: T): [K, T[K]][] {
    return Object.entries(obj) as any
}

function abbreviateUnit(unit: string): string {
    switch (unit) {
        case 'gigabyte':
            return 'GB'
        case 'megabyte':
            return 'MB'
        default:
            return ''
    }
}

export function getInstanceDescription(type: InstanceType): InstanceDescription {
    // TODO: add developer types?
    const desc = workspaceOptions.instanceType[type]

    return {
        name: toTitleCase(type.split('.').pop()!),
        specs: `${desc.vcpus} vCPUs, ${desc.ram.value}${abbreviateUnit(desc.ram.unit)} RAM`,
    }
}

export function getAllInstanceDescriptions(): { [key: string]: InstanceDescription } {
    const desc: { [key: string]: InstanceDescription } = {}
    entries(workspaceOptions.instanceType).forEach(([k]) => (desc[k] = getInstanceDescription(k)))
    return desc
}

export function createInstancePrompter(): QuickPickPrompter<InstanceType> {
    const items = entries(workspaceOptions.instanceType).map(([name, desc]) => ({
        data: name,
        label: `${getInstanceDescription(name).name} (${getInstanceDescription(name).specs})`,
    }))

    return createQuickPick(items, {
        title: 'Compute Size',
    })
}

export function createTimeoutPrompter(): Prompter<number> {
    return createInputBox({
        title: 'Timeout Length',
        placeholder: 'Timeout length in minutes',
        validateInput: resp => (Number.isNaN(Number(resp)) ? 'Timeout must be a number' : undefined),
    }).transform(r => Number(r))
}

export function createAliasPrompter(): InputBoxPrompter {
    return createInputBox({
        title: 'Edit Alias',
        validateInput: value => {
            if (value?.length > 128) {
                return 'Workspace alias cannot be longer than 128 characters'
            }
        },
    })
}

export function createStoragePrompter(): QuickPickPrompter<{ sizeInGiB: number }> {
    const items = settings.environment.persistentStorageSize.map(v => ({
        data: { sizeInGiB: v },
        label: `${v} GB`,
    }))

    return createQuickPick(items, {
        title: 'Storage Size',
    })
}
