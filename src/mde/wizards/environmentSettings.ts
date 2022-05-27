/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as settings from '../parameterDescriptions.json'
import * as mde from '../../../types/clientmde'
import * as _ from 'lodash'
import { isValidResponse, Wizard } from '../../shared/wizards/wizard'
import {
    createQuickPick,
    DataQuickPickItem,
    isDataQuickPickItem,
    QuickPickPrompter,
} from '../../shared/ui/pickerPrompter'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { Prompter } from '../../shared/ui/prompter'
import { applyOperation, compare, deepClone } from 'fast-json-patch'
import { toTitleCase } from '../../shared/utilities/textUtilities'

export type InstanceType = keyof typeof environmentOptions['instanceType']
interface InstanceDescription {
    name: string
    specs: string
}

const environmentOptions = settings['environment']

function entries<T, K extends keyof T = keyof T & string>(obj: T): [K, T[K]][] {
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
    const desc = environmentOptions.instanceType[type]

    return {
        name: toTitleCase(type.split('.').pop()!),
        specs: `${desc.vcpus} vCPUs, ${desc.ram.value}${abbreviateUnit(desc.ram.unit)} RAM, 64 GiB ephemeral storage`,
    }
}

export function getAllInstanceDescriptions(): { [key: string]: InstanceDescription } {
    const desc: { [key: string]: InstanceDescription } = {}
    entries(environmentOptions.instanceType).forEach(([k]) => (desc[k] = getInstanceDescription(k)))
    return desc
}

export function createInstancePrompter(): QuickPickPrompter<InstanceType> {
    const items = entries(environmentOptions.instanceType).map(([name, desc]) => ({
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

function createStoragePrompt(): QuickPickPrompter<typeof environmentOptions['persistentStorageSize'][number]> {
    const items = environmentOptions.persistentStorageSize.map(v => ({
        label: `${v} GiB`,
        data: v,
    }))

    return createQuickPick(items, {
        title: 'Persistent Storage Size',
    })
}

/**
 * Generates a difference between two objects, ignoring the 'type' of operation that
 * would produce the object. We only care about the cumalative difference.
 */
function diff<T extends Record<string, any>>(obj1: T, obj2: T): Partial<T> {
    const d = {} as T
    compare(obj1, obj2).forEach(operation => {
        const parent = operation.path.split('/').slice(1, -1)
        _.set(d, parent, _.get(d, parent, {}))
        applyOperation(d, operation)
    })
    return d
}

function createMenuPrompt(initState: SettingsForm, currentState: SettingsForm, type: 'create' | 'configure') {
    const diffState = diff(initState, currentState)

    const instanceDesc = getInstanceDescription(currentState.instanceType)
    const instanceItem = {
        label: 'Edit compute size',
        skipEstimate: true,
        description: diffState.instanceType !== undefined ? '(Modified)' : undefined,
        detail: `${instanceDesc.name} (${instanceDesc.specs})`,
        data: async () => {
            const prompter = createInstancePrompter()
            prompter.recentItem = currentState.instanceType
            const result = await prompter.prompt()

            if (isValidResponse(result)) {
                currentState.instanceType = result
            }

            return instanceItem
        },
    }

    const timeoutItem = {
        label: 'Edit timeout length',
        skipEstimate: true,
        description: diffState.inactivityTimeoutMinutes !== undefined ? '(Modified)' : undefined,
        detail: `${currentState.inactivityTimeoutMinutes} minutes`,
        data: async () => {
            const prompter = createTimeoutPrompter()
            prompter.recentItem = currentState.inactivityTimeoutMinutes.toString()
            const result = await prompter.prompt()

            if (isValidResponse(result)) {
                currentState.inactivityTimeoutMinutes = result
            }

            return timeoutItem
        },
    }

    const storageItem = {
        label: 'Edit persistent storage size',
        skipEstimate: true,
        description: diffState.persistentStorage?.sizeInGiB !== undefined ? '(Modified)' : undefined,
        detail: `${currentState.persistentStorage.sizeInGiB} GB`,
        data: async () => {
            const prompter = createStoragePrompt()
            prompter.recentItem = currentState.persistentStorage.sizeInGiB
            const result = await prompter.prompt()

            if (isValidResponse(result)) {
                currentState.persistentStorage = { sizeInGiB: result }
            }

            return storageItem
        },
    }

    const items = [instanceItem, timeoutItem].concat(type === 'create' ? [storageItem] : [])

    const saveItem = {
        label: 'Save Settings',
        data: currentState,
        alwaysShow: true,
    }

    return createQuickPick<SettingsForm | DataQuickPickItem<any>>([saveItem, ...items], {
        title: 'Environment Settings',
        recentItemText: false,
    })
}

export type SettingsForm = Pick<mde.CreateEnvironmentRequest, 'instanceType' | 'persistentStorage'> & {
    instanceType: InstanceType
    inactivityTimeoutMinutes: number
}

// TODO: don't extend wizard, just make a separate class
// There's clearly an abstraction here, though not worth pursuing currently
export class EnvironmentSettingsWizard extends Wizard<SettingsForm> {
    constructor(private readonly initState: SettingsForm, private readonly type: 'create' | 'configure' = 'create') {
        super()
    }

    public async run(): Promise<SettingsForm | undefined> {
        const curr = deepClone(this.initState)
        let lastItem: DataQuickPickItem<any> | undefined

        while (true) {
            const prompter = createMenuPrompt(this.initState, curr, this.type)
            prompter.recentItem = lastItem
            const response = await prompter.prompt()

            if (!isValidResponse(response)) {
                break
            }

            if (isDataQuickPickItem(response)) {
                lastItem = response
                continue
            }

            return response
        }
    }
}
