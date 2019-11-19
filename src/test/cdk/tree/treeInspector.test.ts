/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as treeInspector from '../../../cdk/explorer/tree/treeInspector'
import { ConstructTreeEntity } from '../../../cdk/explorer/tree/types'
import * as treeUtils from '../utilities/treeTestUtils'

describe('TreeInspector', () => {
    const testLabel = 'my label'
    const treePath = 'my-project/cdk.out/tree.json'

    it('returns label when construct is not named Resource', async () => {
        const construct = treeUtils.generateConstructTreeEntity(testLabel, treePath)

        const label = treeInspector.getDisplayLabel(construct)

        assert.strictEqual(label, construct.id, 'Unexpected label')
    })

    it('includes type when construct is named Resource and type exists', async () => {
        const id = 'Resource'
        const type = 'AWS::S3::Bucket'
        const attributes = { 'aws:cdk:cloudformation:type': type }

        const construct: ConstructTreeEntity = { id, path: treePath, attributes }

        const label = treeInspector.getDisplayLabel(construct)

        assert.strictEqual(label, `${id} (${type})`)
    })

    it('returns unchanged label when construct is named Resource and no type information exists', async () => {
        const id = 'Resource'

        const construct: ConstructTreeEntity = { id, path: treePath }

        const label = treeInspector.getDisplayLabel(construct)

        assert.strictEqual(label, id)
    })

    it('returns default if no type information exists', async () => {
        const construct = treeUtils.generateConstructTreeEntity(testLabel, treePath)

        const type = treeInspector.getTypeAttributeOrDefault(construct, '')

        assert.strictEqual(type, '')
    })

    it('returns type when type information exists', async () => {
        const testType = 'AWS:SQS::Queue'
        const construct: ConstructTreeEntity = {
            id: testLabel,
            path: treePath,
            attributes: { 'aws:cdk:cloudformation:type': testType }
        }

        const type = treeInspector.getTypeAttributeOrDefault(construct, '')

        assert.strictEqual(type, testType)
    })

    it('includes construct in tree', async () => {
        const construct = treeUtils.generateConstructTreeEntity(testLabel, treePath)

        const includeConstruct = treeInspector.includeConstructInTree(construct)

        assert.strictEqual(includeConstruct, true, 'expected construct to be included in the tree')
    })

    it('excludes the `Tree` construct that the CDK adds by default', async () => {
        const construct: ConstructTreeEntity = { id: 'Tree', path: 'Tree' }

        const includeConstruct = treeInspector.includeConstructInTree(construct)

        assert.strictEqual(includeConstruct, false, 'Tree construct should be excluded from the tree')
    })
})
