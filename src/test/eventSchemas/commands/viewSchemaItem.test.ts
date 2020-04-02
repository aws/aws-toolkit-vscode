/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schemas } from 'aws-sdk'

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { schemaFormatter, showSchemaContent, viewSchemaItem } from '../../../eventSchemas/commands/viewSchemaItem'
import { SchemaItemNode } from '../../../eventSchemas/explorer/schemaItemNode'
import { getTabSizeSetting } from '../../../shared/utilities/editorUtilities'

import { MockSchemaClient } from '../../shared/clients/mockClients'

const SCHEMA_TAB_SIZE = 2
const AWS_EVENT_SCHEMA_RAW =
    '{"openapi":"3.0.0","info":{"version":"1.0.0","title":"Event"},"paths":{},"components":{"schemas":{"Event":{"type":"object","required":["result","cause","event","request-id"],"properties":{"cause":{"type":"string"},"event":{"type":"string"},"request-id":{"type":"string"},"result":{"type":"integer"}}}}}}'

const AWS_EVENT_SCHEMA_PRETTY = `{
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

describe('viewSchemaItem', async () => {
    let sandbox: sinon.SinonSandbox
    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('schemaFormatter', () => {
        it('can pretty print schema content', () => {
            const formattedSchema = schemaFormatter(AWS_EVENT_SCHEMA_RAW, SCHEMA_TAB_SIZE)
            assert.strictEqual(formattedSchema, AWS_EVENT_SCHEMA_PRETTY, 'Schema content not pretty printed')
        })
    })

    describe('showSchemaContent', async () => {
        it('inserts pretty schema content into an editor', async () => {
            const insertStub = stubTextEditInsert()
            await showSchemaContent(AWS_EVENT_SCHEMA_RAW, SCHEMA_TAB_SIZE)

            assert.strictEqual(insertStub.calledOnce, true, 'should be called once')
            assert.strictEqual(insertStub.getCalls()[0].args[1], AWS_EVENT_SCHEMA_PRETTY, 'should insert pretty schema')
        })
    })

    const testSchemaName = 'testSchema'
    const testRegistryName = 'testRegistry'
    const fakeSchema = {
        SchemaName: testSchemaName,
    }
    const expectedSchema = JSON.stringify(JSON.parse(AWS_EVENT_SCHEMA_RAW), undefined, getTabSizeSetting())

    it('prettifies schema content and inserts into the editor ', async () => {
        const schemaNode = generateSchemaItemNode()
        const insertStub = stubTextEditInsert()

        await viewSchemaItem(schemaNode)
        assert.strictEqual(insertStub.getCalls()[0].args[1], expectedSchema, 'should insert pretty schema')
    })

    function stubTextEditInsert() {
        const textEdit = ({
            insert: () => {},
        } as any) as vscode.TextEditorEdit

        const textEditor = ({
            edit: () => {},
        } as any) as vscode.TextEditor

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
            Content: AWS_EVENT_SCHEMA_RAW,
        }
        const schemaClient = new MockSchemaClient()
        sandbox.stub(schemaClient, 'describeSchema').returns(Promise.resolve(schemaResponse))

        return new SchemaItemNode(fakeSchema, schemaClient, testRegistryName)
    }
})
