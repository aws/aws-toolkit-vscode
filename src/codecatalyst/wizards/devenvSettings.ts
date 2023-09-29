/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as settings from './parameterDescriptions.json'
import { createQuickPick, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { createInputBox, InputBoxPrompter } from '../../shared/ui/inputPrompter'
import { Prompter } from '../../shared/ui/prompter'
import { toTitleCase } from '../../shared/utilities/textUtilities'

const devenvOptions = settings['environment']
export type InstanceType = keyof (typeof devenvOptions)['instanceType']
export type SubscriptionType = (typeof subscriptionTypes)[number]

const subscriptionTypes = ['FREE', 'STANDARD'] as const

export function isValidSubscriptionType(type = ''): type is SubscriptionType {
    return (subscriptionTypes as readonly string[]).includes(type)
}

interface InstanceDescription {
    name: string
    specs: string
}

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
    const desc = devenvOptions.instanceType[type]

    return {
        name: toTitleCase(type.split('.').pop()!),
        specs: `${desc.vcpus} vCPUs, ${desc.ram.value}${abbreviateUnit(desc.ram.unit)} RAM`,
    }
}

export function getAllInstanceDescriptions(): { [key: string]: InstanceDescription } {
    const desc: { [key: string]: InstanceDescription } = {}
    entries(devenvOptions.instanceType).forEach(([k]) => (desc[k] = getInstanceDescription(k)))
    return desc
}

export function createInstancePrompter(subscriptionType: SubscriptionType): QuickPickPrompter<InstanceType> {
    const isSupported = (name: string) => subscriptionType !== 'FREE' || name === 'dev.standard1.small'
    const items = entries(devenvOptions.instanceType).map(([name, desc]) => ({
        data: name,
        label: `${getInstanceDescription(name).name} (${getInstanceDescription(name).specs})`,
        description: isSupported(name) ? '' : 'unavailable in current billing tier',
        invalidSelection: !isSupported(name),
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
                return 'Dev Environment alias cannot be longer than 128 characters'
            }
        },
    })
}

export function createStoragePrompter(subscriptionType: SubscriptionType): QuickPickPrompter<{ sizeInGiB: number }> {
    const isSupported = (v: number) => subscriptionType !== 'FREE' || v === 16
    const items = settings.environment.persistentStorageSize.map(v => ({
        data: { sizeInGiB: v },
        label: `${v} GB`,
        description: isSupported(v) ? '' : 'unavailable in current organization billing tier',
        invalidSelection: !isSupported(v),
    }))

    return createQuickPick(items, {
        title: 'Storage Size',
    })
}
