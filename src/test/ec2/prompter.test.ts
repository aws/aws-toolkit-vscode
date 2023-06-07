/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { intoCollection } from '../utilities/collectionUtils'
import { createInstancePrompter } from '../../ec2/prompter'
import { createQuickPickPrompterTester } from '../shared/ui/testUtils'

describe('ec2InstancePrompter', function () {
    
    it('can list instanceIds', async function () {
        const testInstances = intoCollection(['first', 'second', 'third'])
        const prompt = createInstancePrompter(testInstances)
        const tester = createQuickPickPrompterTester(prompt)

        tester.assertItems([{label: 'first', data: 'first'}, {label: 'second', data: 'second'}, {label: 'third', data: 'third'}])
        tester.acceptItem('first')
        
        await tester.result()
    })

})