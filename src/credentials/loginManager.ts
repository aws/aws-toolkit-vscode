/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AwsContext } from '../shared/awsContext'
import { getAccountId } from '../shared/credentials/accountId'
import { UserCredentialsUtils } from '../shared/credentials/userCredentialsUtils'
import { getLogger } from '../shared/logger'
import { createCredentials } from './credentialsCreator'
import { CredentialsStore } from './credentialsStore'

export class LoginManager {
    private readonly credentialsStore: CredentialsStore = new CredentialsStore()

    public constructor(private readonly awsContext: AwsContext) {}

    /**
     * Establishes a Credentials for the Toolkit to use. Essentially the Toolkit becomes "logged in".
     * If an error occurs while trying to set up and verify these credentials, the Toolkit is "logged out".
     */
    public async login(credentialsId: string): Promise<void> {
        try {
            const credentials = await this.credentialsStore.getCredentialsOrCreate(credentialsId, createCredentials)
            if (!credentials) {
                throw new Error(`No credentials found for id ${credentialsId}`)
            }

            // TODO : Get a region relevant to the partition for these credentials -- https://github.com/aws/aws-toolkit-vscode/issues/188
            const accountId = await getAccountId(credentials, 'us-east-1')

            if (!accountId) {
                throw new Error('Could not determine Account Id for credentials')
            }

            await this.awsContext.setCredentials({
                credentials: credentials,
                credentialsId: credentialsId,
                accountId: accountId
            })
        } catch (err) {
            getLogger().error('Error logging in', err as Error)
            this.credentialsStore.invalidateCredentials(credentialsId)

            await this.logout()

            // tslint:disable-next-line: no-floating-promises
            UserCredentialsUtils.notifyUserCredentialsAreBad(credentialsId)
        }
    }

    /**
     * Removes Credentials from the Toolkit. Essentially the Toolkit becomes "logged out".
     */
    public async logout(): Promise<void> {
        await this.awsContext.setCredentials(undefined)
    }
}
