/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { instance, when } from 'ts-mockito'
import { createOrgPrompter } from '../../../caws/wizards/selectResource'
import { CawsOrg, ConnectedCawsClient } from '../../../shared/clients/cawsClient'
import { AsyncCollection, toCollection } from '../../../shared/utilities/asyncCollection'
import { createQuickPickTester } from '../../shared/ui/testUtils'
import { mock } from '../../utilities/mockito'

// TODO: move to test utils
function intoCollection<T>(arr: T[]): AsyncCollection<T> {
    return toCollection(async function* () {
        yield* arr
    })
}

describe('Prompts', function () {
    let orgs: CawsOrg[]

    beforeEach(function () {
        orgs = [{ type: 'org', name: 'MyOrg', description: 'My Description', regionName: 'region' }]
    })

    function mockClient(): ConnectedCawsClient {
        const client = mock<ConnectedCawsClient>()

        when(client.listOrganizations()).thenReturn(intoCollection([orgs]))

        return instance(client)
    }

    it('can list organizations', async function () {
        const prompt = createOrgPrompter(mockClient())
        const tester = createQuickPickTester(prompt)

        tester.assertItems([{ label: 'MyOrg', detail: 'My Description', data: orgs[0] }])
        tester.acceptItem('MyOrg')

        await tester.result()
    })

    it('can refresh organizations', async function () {
        const prompt = createOrgPrompter(mockClient())
        const tester = createQuickPickTester(prompt)
        const newOrg = { type: 'org', name: 'AnotherOrg', description: 'More Text', regionName: 'region' } as const

        tester.assertItems([{ label: 'MyOrg', detail: 'My Description', data: orgs[0] }])
        tester.addCallback(() => orgs.push(newOrg))
        tester.pressButton('Refresh')
        tester.assertItems(['MyOrg', 'AnotherOrg'])
        tester.acceptItem('AnotherOrg')

        await tester.result(newOrg)
    })
})
