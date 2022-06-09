/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { ConsoleLinkBuilder } from '../../../shared/deeplinks/builder'
import { documentationUrl } from '../../../shared/constants'
import { openArn } from '../../../shared/deeplinks/commands'
import { assertTelemetry } from '../../testUtil'
import { createTestWindow } from '../vscode/window'
import { SeverityLevel } from '../vscode/message'

const testLink = vscode.Uri.parse(documentationUrl)

describe('openArn', function () {
    beforeEach(function () {
        sinon.stub(vscode.env, 'openExternal').resolves(true)
    })

    afterEach(function () {
        sinon.restore()
    })

    it('emits telemetry using the source parameter', async function () {
        const builder = new ConsoleLinkBuilder()
        sinon.stub(builder, 'getLinkFromArn').resolves(testLink)

        await openArn(builder, 'arn:aws:s3:::testbucket/sam_squirrel_1.jpg', 'Editor')
        assertTelemetry('deeplink_open', {
            result: 'Succeeded',
            source: 'Editor',
        })
    })

    it('shows an error message for invalid ARNs', async function () {
        const testWindow = createTestWindow()
        const builder = new ConsoleLinkBuilder()
        sinon.replace(vscode, 'window', testWindow)

        const message = testWindow.waitForMessage(/Failed to open resource/)
        await openArn(builder, 'not:an:arn', 'Explorer')

        const shownMessage = await message
        shownMessage.assertSeverity(SeverityLevel.Error)

        assertTelemetry('deeplink_open', {
            result: 'Failed',
            source: 'Explorer',
        })
    })
})
