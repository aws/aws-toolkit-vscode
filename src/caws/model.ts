/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { HOST_NAME_PREFIX } from '../mde/constants'
import { checkSession, SessionProvider } from '../mde/mdeModel'
import { CawsDevEnv, ConnectedCawsClient } from '../shared/clients/cawsClient'

type DevEnvId = Pick<CawsDevEnv, 'org' | 'project' | 'developmentWorkspaceId'>
export function createCawsSessionProvider(
    client: ConnectedCawsClient,
    region: string,
    ssmPath: string,
    sshPath = 'ssh'
): SessionProvider<DevEnvId> {
    return {
        isActive: env => checkSession(getHostNameFromEnv(env), sshPath),
        getDetails: async env => {
            const session = await client.startDevEnvSession({
                projectName: env.project.name,
                organizationName: env.org.name,
                developmentWorkspaceId: env.developmentWorkspaceId,
            })

            return {
                region,
                ssmPath,
                host: getHostNameFromEnv(env),
                id: session.sessionId,
                ...session,
            }
        },
    }
}

export function getHostNameFromEnv(env: DevEnvId): string {
    return `${HOST_NAME_PREFIX}${env.developmentWorkspaceId}`
}
