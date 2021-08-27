/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { FakeExtensionContext } from '../../fakeExtensionContext'
import { ExtensionContext } from 'vscode'
import { YamlExtension } from '../../../shared/extensions/yaml'
import { SchemaService } from '../../../shared/schema/schemaService'
import { anything, deepEqual, instance, mock, verify } from '../../utilities/mockito'

describe('SchemaService', function () {
    let service: SchemaService
    let fakeExtensionContext: ExtensionContext
    let fakeYamlExtension: YamlExtension
    const cfnSchema = vscode.Uri.file('cfn')
    const samSchema = vscode.Uri.file('sam')

    beforeEach(function () {
        fakeExtensionContext = new FakeExtensionContext()
        fakeYamlExtension = mock()
        service = new SchemaService(fakeExtensionContext, instance(fakeYamlExtension), {
            schemas: {
                cfn: cfnSchema,
                sam: samSchema,
            },
        })
    })

    it('assigns schemas to the yaml extension', async function () {
        service.registerMapping({
            path: '/foo',
            schema: 'cfn',
        })
        service.registerMapping({
            path: '/bar',
            schema: 'sam',
        })
        await service.processUpdates()
        verify(fakeYamlExtension.assignSchema(deepEqual(vscode.Uri.file('/foo')), cfnSchema)).once()
        verify(fakeYamlExtension.assignSchema(deepEqual(vscode.Uri.file('/bar')), samSchema)).once()
    })

    it('removes schemas from the yaml extension', async function () {
        service.registerMapping({
            path: '/foo',
            schema: 'none',
        })
        await service.processUpdates()
        verify(fakeYamlExtension.removeSchema(deepEqual(vscode.Uri.file('/foo')))).once()
    })

    it('processes no updates if schemas are unavailable', async function () {
        fakeYamlExtension = mock()
        service = new SchemaService(fakeExtensionContext, instance(fakeYamlExtension))

        service.registerMapping({
            path: '/foo',
            schema: 'cfn',
        })
        await service.processUpdates()
        verify(fakeYamlExtension.assignSchema(anything(), anything())).never()
    })

    it('processes no updates if yaml extension unavailable', async function () {
        fakeYamlExtension = mock()
        service = new SchemaService(fakeExtensionContext)

        service.registerMapping({
            path: '/foo',
            schema: 'cfn',
        })
        await service.processUpdates()
        verify(fakeYamlExtension.assignSchema(anything(), anything())).never()
    })
})
