'use strict'

import * as nls from 'vscode-nls'
let localize = nls.loadMessageBundle()

import { ExtensionContext, window, StatusBarItem, StatusBarAlignment } from 'vscode'
import { ContextChangeEventsArgs } from './defaultAwsContext'
import { AwsContext } from './awsContext'

// may want to have multiple elements of data on the status bar,
// so wrapping in a class to allow for per-element update capability
export class AWSStatusBar {

    private _awsContext: AwsContext

    public readonly credentialContext: StatusBarItem

    constructor(awsContext: AwsContext, context: ExtensionContext) {
        this._awsContext = awsContext

        this.credentialContext = window.createStatusBarItem(StatusBarAlignment.Right, 100)
        context.subscriptions.push(this.credentialContext)

        this._awsContext.onDidChangeContext((context) => {
            this.updateContext(context)
        })
    }

    public async updateContext(eventContext: ContextChangeEventsArgs | undefined) {
        let profileName: string | undefined

        if (eventContext) {
            profileName = eventContext.profileName
        }
        else {
            profileName = this._awsContext.getCredentialProfileName()
        }

        if (profileName) {
            this.credentialContext.text = localize('AWS.title', 'AWS') + ':' + profileName
            this.credentialContext.show()
        } else {
            this.credentialContext.hide()
        }
    }
}