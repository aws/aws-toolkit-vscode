/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import { YamlExtension } from '../../shared/extensions/yaml'
import {
    JsonSchemaHandler,
    JSONSchemaSettings,
    SchemaHandler,
    SchemaService,
    SchemaType,
    YamlSchemaHandler,
} from '../../shared/schemas'
import { Settings } from '../../shared/settings'
import sinon from 'sinon'

describe('SchemaService', function () {
    let service: SchemaService
    let config: Settings
    let fakeYamlExtension: YamlExtension
    const cfnSchema = vscode.Uri.file('cfn')
    const samSchema = vscode.Uri.file('sam')

    beforeEach(async function () {
        fakeYamlExtension = {} as any as YamlExtension
        config = new Settings(vscode.ConfigurationTarget.Workspace)

        service = new SchemaService({
            schemas: {
                cfn: cfnSchema,
                sam: samSchema,
            },
            handlers: new Map<SchemaType, SchemaHandler>([
                ['json', new JsonSchemaHandler(config)],
                ['yaml', new YamlSchemaHandler(fakeYamlExtension)],
            ]),
        })
    })

    it('assigns schemas to the yaml extension', async function () {
        const stub = sinon.stub()
        fakeYamlExtension.assignSchema = stub
        service.registerMapping({
            uri: vscode.Uri.parse('/foo'),
            type: 'yaml',
            schema: 'cfn',
        })
        service.registerMapping({
            uri: vscode.Uri.parse('/bar'),
            type: 'yaml',
            schema: 'sam',
        })
        await service.processUpdates()
        assert(stub.firstCall.calledWithExactly(vscode.Uri.file('/foo'), cfnSchema))
        assert(stub.secondCall.calledWithExactly(vscode.Uri.file('/bar'), samSchema))
    })

    it('removes schemas from the yaml extension', async function () {
        const stub = sinon.stub()
        fakeYamlExtension.removeSchema = stub
        service.registerMapping({
            uri: vscode.Uri.parse('/foo'),
            type: 'yaml',
            schema: undefined,
        })
        await service.processUpdates()
        assert(stub.calledOnceWithExactly(vscode.Uri.file('/foo')))
    })

    it('registers schemas to json configuration', async function () {
        service.registerMapping({
            uri: vscode.Uri.parse('/foo'),
            type: 'json',
            schema: 'cfn',
        })
        await service.processUpdates()

        const mappings = config.get('json.schemas')
        assert.ok(Array.isArray(mappings))

        const added = mappings.find((s: JSONSchemaSettings) => s.url === cfnSchema.toString())
        assert.ok(added)

        assert.strictEqual(added.fileMatch?.length, 1)
        assert.strictEqual(added.fileMatch[0], '/foo')
    })

    it('removes schemas from json configuration', async function () {
        service.registerMapping({
            uri: vscode.Uri.parse('/foo'),
            type: 'json',
            schema: undefined,
        })
        await service.processUpdates()

        const mappings = config.get('json.schemas')
        assert.ok(Array.isArray(mappings))

        const added = mappings.find((s: JSONSchemaSettings) => s.url === cfnSchema.toString())
        assert.strictEqual(added, undefined)
    })

    it('processes no updates if schemas are unavailable', async function () {
        const stub = sinon.stub()
        fakeYamlExtension.assignSchema = stub
        service = new SchemaService({
            handlers: new Map<SchemaType, SchemaHandler>([
                ['json', new JsonSchemaHandler()],
                ['yaml', new YamlSchemaHandler(fakeYamlExtension)],
            ]),
        })

        service.registerMapping({
            uri: vscode.Uri.parse('/foo'),
            type: 'yaml',
            schema: 'cfn',
        })
        await service.processUpdates()
        assert(stub.notCalled)
    })

    it('processes no updates if yaml extension unavailable', async function () {
        const stub = sinon.stub()
        fakeYamlExtension.assignSchema = stub
        service = new SchemaService()

        service.registerMapping({
            uri: vscode.Uri.parse('/foo'),
            type: 'yaml',
            schema: 'cfn',
        })
        await service.processUpdates()
        assert(stub.notCalled)
    })
})
