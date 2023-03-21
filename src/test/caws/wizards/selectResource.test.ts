/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { instance, when } from 'ts-mockito'
import { createOrgPrompter, createProjectPrompter } from '../../../codecatalyst/wizards/selectResource'
import { CodeCatalystOrg, CodeCatalystClient, CodeCatalystProject } from '../../../shared/clients/codecatalystClient'
import { AsyncCollection, toCollection } from '../../../shared/utilities/asyncCollection'
import { createQuickPickPrompterTester } from '../../shared/ui/testUtils'
import { mock } from '../../utilities/mockito'

// TODO: move to test utils
function intoCollection<T>(arr: T[]): AsyncCollection<T> {
    return toCollection(async function* () {
        yield* arr
    })
}

describe('Prompts', function () {
    let orgs: CodeCatalystOrg[]
    let projects: CodeCatalystProject[]

    beforeEach(function () {
        orgs = [{ type: 'org', name: 'MyOrg', description: 'My Description', regionName: 'region' }]
        projects = orgs.map(org => ({
            name: 'MyProject',
            type: 'project',
            org,
        }))
    })

    function mockClient(): CodeCatalystClient {
        const client = mock<CodeCatalystClient>()

        when(client.listSpaces()).thenReturn(intoCollection([orgs]))
        when(client.listResources('project')).thenReturn(intoCollection([projects]))

        return instance(client)
    }

    it('can list spaces (organizations)', async function () {
        const prompt = createOrgPrompter(mockClient())
        const tester = createQuickPickPrompterTester(prompt)

        tester.assertItems([{ label: 'MyOrg', detail: 'My Description', data: orgs[0] }])
        tester.acceptItem('MyOrg')

        await tester.result()
    })

    it('can refresh spaces (organizations)', async function () {
        const prompt = createOrgPrompter(mockClient())
        const tester = createQuickPickPrompterTester(prompt)
        const newOrg = { type: 'org', name: 'AnotherOrg', description: 'More Text', regionName: 'region' } as const

        tester.assertItems([{ label: 'MyOrg', detail: 'My Description', data: orgs[0] }])
        tester.addCallback(() => orgs.push(newOrg))
        tester.pressButton('Refresh')
        tester.assertItems(['MyOrg', 'AnotherOrg'])
        tester.acceptItem('AnotherOrg')

        await tester.result(newOrg)
    })

    it('can refresh projects', async function () {
        const prompt = createProjectPrompter(mockClient())
        const tester = createQuickPickPrompterTester(prompt)
        const newProj = { type: 'project', name: 'AnotherProject', org: orgs[0] } as const

        tester.assertItems(['MyOrg / MyProject'])
        tester.addCallback(() => projects.push(newProj))
        tester.pressButton('Refresh')
        tester.assertItems(['MyOrg / MyProject', 'MyOrg / AnotherProject'])
        tester.acceptItem('MyOrg / AnotherProject')

        await tester.result(newProj)
    })
})
