/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { SsoConnection } from '../../../../auth/connection'
import { AuthUtil, amazonQScopes } from '../../../../codewhisperer/util/authUtil'
import { AuthError, CommonAuthWebview } from '../backend'
import { awsIdSignIn } from '../../../../codewhisperer/util/showSsoPrompt'
import { connectToEnterpriseSso } from '../../../../codewhisperer/util/getStartUrl'
import { activateExtension, isExtensionActive } from '../../../../shared/utilities/vsCodeUtils'
import { VSCODE_EXTENSION_ID } from '../../../../shared/extensions'

export class AmazonQLoginWebview extends CommonAuthWebview {
    public override id: string = 'aws.amazonq.AmazonCommonAuth'
    public static sourcePath: string = 'vue/src/login/webview/vue/amazonq/index.js'

    constructor() {
        super(AmazonQLoginWebview.sourcePath)
    }

    public isAwsToolkitInstalled(): boolean {
        const extensions = vscode.extensions.all
        const q = extensions.find(x => x.id === VSCODE_EXTENSION_ID.awstoolkit)
        return q !== undefined
    }

    async fetchConnections(): Promise<SsoConnection[] | undefined> {
        if (!this.isAwsToolkitInstalled()) {
            return undefined
        }
        await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
        const toolkitExt = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)
        const importedApi = toolkitExt?.exports
        const connections: SsoConnection[] = []
        if (importedApi && 'listConnections' in importedApi) {
            const toolkitConnections = await importedApi?.listConnections()
            toolkitConnections.forEach((connection: SsoConnection) => {
                if (connection.scopes?.includes('codewhisperer:completions')) {
                    connections.push(connection)
                } else {
                    // adding scopes to the connection
                    // user will be asked to re-authorize in browser
                    // once the connection is in use
                    connections.push({
                        id: connection.id,
                        label: connection.label,
                        scopes: amazonQScopes,
                        ssoRegion: connection.ssoRegion,
                        type: connection.type,
                        startUrl: connection.startUrl,
                        getToken: () => connection.getToken(),
                    })
                }
            })
        }
        return connections
    }

    async useConnection(connectionId: string): Promise<AuthError | undefined> {
        if (!this.isAwsToolkitInstalled()) {
            return undefined
        }
        try {
            await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
            const toolkitExt = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)
            const importedApi = toolkitExt?.exports
            if (importedApi && 'listConnections' in importedApi) {
                const connections: SsoConnection[] = await importedApi?.listConnections()
                connections.forEach(async (connection: SsoConnection) => {
                    if (connection.id === connectionId) {
                        await AuthUtil.instance.secondaryAuth.useNewConnection(connection)
                        return undefined
                    }
                })
            }
        } catch (error) {
            return { id: '', text: error as string }
        }
    }

    async startBuilderIdSetup(): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeWhispererBuilderIdSetup', async () => {
            await awsIdSignIn()
            AuthUtil.instance.hasAlreadySeenMigrationAuthScreen = true
            this.notifyToolkit()
            await vscode.window.showInformationMessage('AmazonQ: Successfully connected to AWS Builder ID')
        })
    }

    startEnterpriseSetup(startUrl: string, region: string): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeWhispererEnterpriseSetup', async () => {
            await connectToEnterpriseSso(startUrl, region)
            AuthUtil.instance.hasAlreadySeenMigrationAuthScreen = true
            this.notifyToolkit()
            void vscode.window.showInformationMessage('AmazonQ: Successfully connected to AWS IAM Identity Center')
        })
    }

    notifyToolkit() {
        if (isExtensionActive(VSCODE_EXTENSION_ID.awstoolkit)) {
            void vscode.commands.executeCommand('_aws.toolkit.auth.restore')
        }
    }

    async errorNotification(e: AuthError) {
        await vscode.window.showInformationMessage(`${e.text}`)
    }

    override startIamCredentialSetup(
        profileName: string,
        accessKey: string,
        secretKey: string
    ): Promise<AuthError | undefined> {
        throw new Error('Method not implemented.')
    }
}
