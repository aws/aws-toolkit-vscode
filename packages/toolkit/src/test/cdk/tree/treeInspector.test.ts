/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as treeInspector from '../../../cdk/explorer/tree/treeInspector'
import { CfnResourceKeys, ConstructProps, ConstructTreeEntity } from '../../../cdk/explorer/tree/types'
import * as treeUtils from '../treeTestUtils'

describe('TreeInspector', function () {
    const testLabel = 'my label'
    const treePath = 'my-project/cdk.out/tree.json'

    it('returns label when construct is not named Resource', async function () {
        const construct = treeUtils.generateConstructTreeEntity(testLabel, treePath)

        const label = treeInspector.getDisplayLabel(construct)

        assert.strictEqual(label, construct.id, 'Unexpected label')
    })

    it('includes type when construct is named Resource and type exists', async function () {
        const id = 'Resource'
        const type = 'AWS::S3::Bucket'
        const attributes = { 'aws:cdk:cloudformation:type': type }

        const construct: ConstructTreeEntity = { id, path: treePath, attributes }

        const label = treeInspector.getDisplayLabel(construct)

        assert.strictEqual(label, `${id} (${type})`)
    })

    it('returns unchanged label when construct is named Resource and no type information exists', async function () {
        const id = 'Resource'

        const construct: ConstructTreeEntity = { id, path: treePath }

        const label = treeInspector.getDisplayLabel(construct)

        assert.strictEqual(label, id)
    })

    it('returns default if no type information exists', async function () {
        const construct = treeUtils.generateConstructTreeEntity(testLabel, treePath)

        const type = treeInspector.getTypeAttributeOrDefault(construct, '')

        assert.strictEqual(type, '')
    })

    it('returns type when type information exists', async function () {
        const testType = 'AWS:SQS::Queue'
        const construct: ConstructTreeEntity = {
            id: testLabel,
            path: treePath,
            attributes: { 'aws:cdk:cloudformation:type': testType },
        }

        const type = treeInspector.getTypeAttributeOrDefault(construct, '')

        assert.strictEqual(type, testType)
    })

    it('includes construct in tree', async function () {
        const construct = treeUtils.generateConstructTreeEntity(testLabel, treePath)

        const includeConstruct = treeInspector.includeConstructInTree(construct)

        assert.strictEqual(includeConstruct, true, 'expected construct to be included in the tree')
    })

    it('excludes the `Tree` construct that the CDK adds by default', async function () {
        const construct: ConstructTreeEntity = { id: 'Tree', path: 'Tree' }

        const includeConstruct = treeInspector.includeConstructInTree(construct)

        assert.strictEqual(includeConstruct, false, 'Tree construct should be excluded from the tree')
    })

    it('returns properties when a construct has attributes', async function () {
        const attributes = treeUtils.generateAttributes()
        const expectedProps: ConstructProps = attributes[CfnResourceKeys.PROPS]
        const construct: ConstructTreeEntity = {
            id: 'test-label',
            path: 'a rare path',
            attributes: treeUtils.generateAttributes(),
        }

        const props = treeInspector.getProperties(construct)

        assert.deepStrictEqual(props, expectedProps)
    })

    it('returns undefined when construct does not have attributes', async function () {
        const construct: ConstructTreeEntity = {
            id: 'no',
            path: 'attributes',
        }

        const props = treeInspector.getProperties(construct)

        assert.strictEqual(props, undefined)
    })

    it('returns undefined when construct does not have CloudFormation properties', async function () {
        const construct: ConstructTreeEntity = {
            id: 'no-cloudformation',
            path: 'attributes',
            attributes: { random: 'stuff' },
        }

        const props = treeInspector.getProperties(construct)

        assert.strictEqual(props, undefined)
    })
})
