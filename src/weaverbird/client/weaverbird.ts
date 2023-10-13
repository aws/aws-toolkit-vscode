/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Service } from 'aws-sdk'
import * as WeaverbirdClient from './weaverbirdclient'
import globals from '../../shared/extensionGlobals'
import apiConfig = require('./weaverbird-2018-05-10.api.json')
import { ServiceOptions } from '../../shared/awsClientBuilder'
import { Auth } from '../../auth/auth'
import { isIamConnection } from '../../auth/connection'
import { ToolkitError } from '../../shared/errors'
import { getConfig } from '../config'

export async function createWeaverbirdSdkClient(): Promise<WeaverbirdClient> {
    const conn = Auth.instance.activeConnection
    if (!isIamConnection(conn)) {
        throw new ToolkitError('Connection is not an IAM connection', { code: 'BadConnectionType' })
    }
    const weaverbirdConfig = await getConfig()
    return (await globals.sdkClientBuilder.createAwsService(
        Service,
        {
            apiConfig: apiConfig,
            region: weaverbirdConfig.region,
            credentials: await conn.getCredentials(),
            endpoint: weaverbirdConfig.endpoint,
            onRequestSetup: [
                req => {
                    console.log(JSON.stringify(req.httpRequest))
                    // do something here
                },
            ],
        } as ServiceOptions,
        undefined
    )) as WeaverbirdClient
}
