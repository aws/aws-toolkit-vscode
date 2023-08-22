/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schemas } from 'aws-sdk'

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { schemaFormatter, showSchemaContent, viewSchemaItem } from '../../../eventSchemas/commands/viewSchemaItem'
import { SchemaItemNode } from '../../../eventSchemas/explorer/schemaItemNode'
import { getTabSizeSetting } from '../../../shared/utilities/editorUtilities'
import { DefaultSchemaClient } from '../../../shared/clients/schemaClient'

const schemaTabSize = 2
const awsEventSchemaRaw =
    '{"openapi":"3.0.0","info":{"version":"1.0.0","title":"Event"},"paths":{},"components":{"schemas":{"Event":{"type":"object","required":["result","cause","event","request-id"],"properties":{"cause":{"type":"string"},"event":{"type":"string"},"request-id":{"type":"string"},"result":{"type":"integer"}}}}}}'

const awsEventSchemaPretty = `{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "Event"
  },
  "paths": {},
  "components": {
    "schemas": {
      "Event": {
        "type": "object",
        "required": [
          "result",
          "cause",
          "event",
          "request-id"
        ],
        "properties": {
          "cause": {
            "type": "string"
          },
          "event": {
            "type": "string"
          },
          "request-id": {
            "type": "string"
          },
          "result": {
            "type": "integer"
          }
        }
      }
    }
  }
}`

describe('viewSchemaItem', async function () {
    let sandbox: sinon.SinonSandbox
    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('schemaFormatter', function () {
        it('can pretty print schema content', function () {
            const formattedSchema = schemaFormatter(awsEventSchemaRaw, schemaTabSize)
            assert.strictEqual(formattedSchema, awsEventSchemaPretty, 'Schema content not pretty printed')
        })
    })

    describe('showSchemaContent', async function () {
        it('inserts pretty schema content into an editor', async function () {
            const insertStub = stubTextEditInsert()
            await showSchemaContent(awsEventSchemaRaw, schemaTabSize)

            assert.strictEqual(insertStub.calledOnce, true, 'should be called once')
            assert.strictEqual(insertStub.getCalls()[0].args[1], awsEventSchemaPretty, 'should insert pretty schema')
        })
    })

    const testSchemaName = 'testSchema'
    const testRegistryName = 'testRegistry'
    const fakeSchema = {
        SchemaName: testSchemaName,
    }
    const expectedSchema = JSON.stringify(JSON.parse(awsEventSchemaRaw), undefined, getTabSizeSetting())

    it('prettifies schema content and inserts into the editor ', async function () {
        const schemaNode = generateSchemaItemNode()
        const insertStub = stubTextEditInsert()

        await viewSchemaItem(schemaNode)
        assert.strictEqual(insertStub.getCalls()[0].args[1], expectedSchema, 'should insert pretty schema')
    })

    function stubTextEditInsert() {
        const textEdit = {
            insert: () => {},
        } as any as vscode.TextEditorEdit

        const textEditor = {
            edit: () => {},
        } as any as vscode.TextEditor

        sinon.stub(textEditor, 'edit').callsFake(async editBuilder => {
            editBuilder(textEdit)

            return true
        })

        sandbox.stub(vscode.window, 'showTextDocument').returns(Promise.resolve(textEditor))
        const insertStub = sandbox.stub(textEdit, 'insert')

        return insertStub
    }

    function generateSchemaItemNode(): SchemaItemNode {
        const schemaResponse: Schemas.DescribeSchemaResponse = {
            Content: awsEventSchemaRaw,
        }
        const schemaClient = new DefaultSchemaClient('')
        sandbox.stub(schemaClient, 'describeSchema').returns(Promise.resolve(schemaResponse))

        return new SchemaItemNode(fakeSchema, schemaClient, testRegistryName)
    }
})
