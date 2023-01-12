/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { getSchemas, shouldUseSchema } from '../../../shared/extensions/yaml'
import assert = require('assert')
import { DocumentsLanguageServer } from '../../../documentTypes/activation'
import Sinon = require('sinon')
import { BuildspecTemplateRegistry } from '../../../shared/buildspec/registry'

describe('getSchemas()', async () => {
    it('Gets single schema', async () => {
        const yamlPath = '/my/file.yaml'
        const registryName = 'registry1'
        const schemaUri = vscode.Uri.file('/my/schema/uri')

        const result = getSchemas(yamlPath, new Map([[yamlPath, new Map([[registryName, schemaUri]])]]))

        assert.deepStrictEqual(result, schemaUri.toString())
    })

    it('Returns undefined if schema should not be used.', async () => {
        const yamlPath = '/my/file.yaml'
        const registryName = 'registry1'
        const schemaUri = vscode.Uri.file('/my/schema/uri')
        const schemaMap = new Map([[yamlPath, new Map([[registryName, schemaUri]])]])

        const returnFalseFunc = (registryName: string) => false

        const result = getSchemas(yamlPath, schemaMap, returnFalseFunc)

        assert.deepStrictEqual(result, undefined)
    })
})

describe('shouldUseSchema()', async () => {
    it('returns false if lsp is enabled and buildspec', async () => {
        const dls = Sinon.createStubInstance(DocumentsLanguageServer)
        dls.isEnabled.returns(true)

        const result = shouldUseSchema(BuildspecTemplateRegistry.name, <any>dls)

        assert(!result)
    })

    it('returns true otherwise', async () => {
        const dls = Sinon.createStubInstance(DocumentsLanguageServer)
        dls.isEnabled.returns(true)

        const result = shouldUseSchema('bla', <any>dls)

        assert(result)
    })
})
