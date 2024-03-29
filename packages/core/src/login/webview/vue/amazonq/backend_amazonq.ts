/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { SsoConnection, scopesCodeWhispererChat, AwsConnection } from '../../../../auth/connection'
import { AuthUtil, amazonQScopes } from '../../../../codewhisperer/util/authUtil'
import { AuthError, CommonAuthWebview } from '../backend'
import { awsIdSignIn } from '../../../../codewhisperer/util/showSsoPrompt'
import { connectToEnterpriseSso } from '../../../../codewhisperer/util/getStartUrl'
import { activateExtension, isExtensionActive, isExtensionInstalled } from '../../../../shared/utilities/vsCodeUtils'
import { VSCODE_EXTENSION_ID } from '../../../../shared/extensions'
import { getLogger } from '../../../../shared/logger'
import { Auth } from '../../../../auth'
import { ToolkitError } from '../../../../shared/errors'

export class AmazonQLoginWebview extends CommonAuthWebview {
    public override id: string = 'aws.amazonq.AmazonCommonAuth'
    public static sourcePath: string = 'vue/src/login/webview/vue/amazonq/index.js'

    constructor() {
        super(AmazonQLoginWebview.sourcePath)
    }

    async fetchConnections(): Promise<SsoConnection[] | undefined> {
        if (!isExtensionInstalled(VSCODE_EXTENSION_ID.awstoolkit)) {
            return undefined
        }
        await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
        const toolkitExt = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)
        const importedApi = toolkitExt?.exports
        const connections: SsoConnection[] = []
        if (importedApi && 'listConnections' in importedApi) {
            return await importedApi?.listConnections()
        }
        return connections
    }

    async useConnection(connectionId: string): Promise<AuthError | undefined> {
        return this.ssoSetup('useConnection', async () => {
            if (!isExtensionInstalled(VSCODE_EXTENSION_ID.awstoolkit)) {
                return
            }
            try {
                await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
                const toolkitExt = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)
                const importedApi = toolkitExt?.exports
                if (importedApi && 'listConnections' in importedApi) {
                    const connections: AwsConnection[] = await importedApi?.listConnections()
                    for (const connection of connections) {
                        if (connection.id === connectionId) {
                            if (connection.scopes?.includes(scopesCodeWhispererChat[0])) {
                                getLogger().info(`auth: re-use connection from existing connection id ${connectionId}`)
                                const conn = await Auth.instance.createConnectionFromApi(connection)
                                await AuthUtil.instance.secondaryAuth.useNewConnection(conn)
                            } else {
                                getLogger().info(
                                    `auth: re-use(new scope) to connection from existing connection id ${connectionId}`
                                )
                                const conn = await Auth.instance.createConnectionFromApi(connection)
                                const newConn = await AuthUtil.instance.secondaryAuth.addScopes(conn, amazonQScopes)
                                await AuthUtil.instance.secondaryAuth.useNewConnection(newConn)
                            }
                        }
                    }
                }
            } catch (e) {
                throw ToolkitError.chain(e, 'Failed to add Amazon Q scope', {
                    code: 'FailedToConnect',
                })
            } finally {
                this.notifyToolkit()
            }
        })
    }

    async startBuilderIdSetup(): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeWhispererBuilderIdSetup', async () => {
            try {
                await awsIdSignIn()
                await vscode.window.showInformationMessage('AmazonQ: Successfully connected to AWS Builder ID')
            } finally {
                this.notifyToolkit()
            }
        })
    }

    async startEnterpriseSetup(startUrl: string, region: string): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeWhispererEnterpriseSetup', async () => {
            try {
                await connectToEnterpriseSso(startUrl, region)
                this.notifyToolkit()
                void vscode.window.showInformationMessage('AmazonQ: Successfully connected to AWS IAM Identity Center')
            } finally {
                this.notifyToolkit()
            }
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

    /** If users are unauthenticated in Q/CW, we should always display the auth screen. */
    async quitLoginScreen() {}

    async refreshToolkit() {}
}
