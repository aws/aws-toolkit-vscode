/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { DocumentItemNodeWriteable } from '../../../ssmDocument/explorer/documentItemNodeWriteable'
import { SsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'
import { deleteDocument } from '../../../ssmDocument/commands/deleteDocument'
import { mock } from '../../utilities/mockito'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { RegistryItemNode } from '../../../ssmDocument/explorer/registryItemNode'
import { SSM } from 'aws-sdk'
import { getTestWindow } from '../../shared/vscode/window'

describe('deleteDocument', async function () {
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

    beforeEach(function () {
        ssmClient = mock()
        parentNode = mock()
        node = new DocumentItemNodeWriteable(fakeDoc, ssmClient, fakeRegion, parentNode)
    })

    it('confirms deletion, deletes file, and refreshes parent node', async function () {
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        const commands = new FakeCommands()
        await deleteDocument(node, commands)
        getTestWindow().getFirstMessage().assertWarn('Are you sure you want to delete document testDocument?')
        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })
})
