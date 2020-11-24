/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { DocumentItemNodeWriteable } from '../../../ssmDocument/explorer/documentItemNodeWriteable'
import { SsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'
import { deleteDocument } from '../../../ssmDocument/commands/deleteDocument'
import { mock } from '../../utilities/mockito'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { RegistryItemNode } from '../../../ssmDocument/explorer/registryItemNode'
import { SSM } from 'aws-sdk'

describe('deleteDocument', async () => {
    let ssmClient: SsmDocumentClient
    let node: DocumentItemNodeWriteable
    let parentNode: RegistryItemNode
    const fakeName: string = 'testDocument'

    const fakeDoc: SSM.Types.DocumentIdentifier = {
        Name: fakeName,
        DocumentFormat: 'json',
        DocumentType: 'Automation',
        Owner: 'Amazon',
    }

    const fakeRegion: string = 'us-east-1'

    beforeEach(() => {
        ssmClient = mock()
        parentNode = mock()
        node = new DocumentItemNodeWriteable(fakeDoc, ssmClient, fakeRegion, parentNode)
    })

    it('confirms deletion, deletes file, and refreshes parent node', async () => {
        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deleteDocument(node, window, commands)
        assert.strictEqual(window.message.warning, 'Are you sure you want to delete document testDocument?')
        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })
})
