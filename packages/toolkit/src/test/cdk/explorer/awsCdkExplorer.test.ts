/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as detectCdkProjects from '../../../cdk/explorer/detectCdkProjects'
import { CdkAppLocation } from '../../../cdk/explorer/cdkProject'
import { CdkRootNode } from '../../../cdk/explorer/rootNode'

describe('CdkRootNode', function () {
    it('shows CDK projects', async function () {
        const appLocation: CdkAppLocation = {
            cdkJsonUri: vscode.Uri.file('/cdk.json'),
            treeUri: vscode.Uri.file('/cdk.out/tree.json'),
        }

        sinon.stub(detectCdkProjects, 'detectCdkProjects').resolves([appLocation])

        const rootNode = new CdkRootNode()
        const treeNodes = await rootNode.getChildren()
        assert.strictEqual(treeNodes.length, 1)
        assert.deepStrictEqual(treeNodes[0].resource, appLocation)
    })
})
