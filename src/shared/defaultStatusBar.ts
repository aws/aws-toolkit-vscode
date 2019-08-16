/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { ExtensionContext, StatusBarAlignment, StatusBarItem, window } from 'vscode'
import { AwsContext, ContextChangeEventsArgs } from './awsContext'
import { AWSStatusBar } from './statusBar'

// may want to have multiple elements of data on the status bar,
// so wrapping in a class to allow for per-element update capability
export class DefaultAWSStatusBar implements AWSStatusBar {
    public readonly credentialContext: StatusBarItem
    private readonly _awsContext: AwsContext

    public constructor(awsContext: AwsContext, context: ExtensionContext) {
        this._awsContext = awsContext

        this.credentialContext = window.createStatusBarItem(StatusBarAlignment.Right, 100)
        context.subscriptions.push(this.credentialContext)

        this._awsContext.onDidChangeContext(async changedContext => await this.updateContext(changedContext))
    }

    public async updateContext(eventContext: ContextChangeEventsArgs | undefined) {
        let profileName: string | undefined

        if (eventContext) {
            profileName = eventContext.profileName
        } else {
            profileName = this._awsContext.getCredentialProfileName()
        }

        if (profileName) {
            this.credentialContext.text = `${localize('AWS.title', 'AWS')}:${profileName}`
            this.credentialContext.show()
        } else {
            this.credentialContext.hide()
        }
    }
}
