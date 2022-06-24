/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { createRegionPrompter } from '../../../shared/ui/common/region'
import { createCommonButtons } from '../../../shared/ui/buttons'
import { createQuickPickTester } from '../../../test/shared/ui/testUtils'
import { AwsContext, DefaultAwsContext } from '../../../shared/awsContext'
import { FakeMemento } from '../../fakeExtensionContext'

describe('guessDefaultRegion', function () {
    it('prompts for region', async function () {
        const regions = [
            { id: 'us-west-2', name: 'PDX' },
            { id: 'us-east-1', name: 'IAD' },
            { id: 'foo-bar-1', name: 'FOO' },
        ]
        const p = createRegionPrompter(regions, {
            title: 'Select regionnnn',
            buttons: createCommonButtons('https://aws.amazon.com/'),
            defaultRegion: 'foo-bar-1',
        })
        const tester = createQuickPickTester(p)
        const selection = regions[0]
        tester.assertItems(['FOO', 'PDX', 'IAD'])
        tester.acceptItem({
            label: selection.name,
            detail: selection.id,
            data: selection,
            skipEstimate: true,
            description: '',
        })
        await tester.result(selection)

        let fakeContext = { globalState: new FakeMemento() } as any as vscode.ExtensionContext
        let semiFakeAwsContext: AwsContext = new DefaultAwsContext(fakeContext)
        const result = semiFakeAwsContext.guessDefaultRegion()

        if (result !== selection.id) {
            const errMsg = `guessDefaultRegion gave region ${result} while selection is region ${selection.id}`
            throw new Error(errMsg)
        }
    })
})
