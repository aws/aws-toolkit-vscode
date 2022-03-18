/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { HOST_NAME_PREFIX } from '../mde/constants'
import { getMdeSsmEnv, SSH_AGENT_SOCKET_VARIABLE, startSshAgent } from '../mde/mdeModel'
import { CawsDevEnv, ConnectedCawsClient } from '../shared/clients/cawsClient'
import { getLogger } from '../shared/logger/logger'
import { ChildProcess } from '../shared/utilities/childProcess'

interface SessionDetails {
    readonly id: string
    readonly region: string
    readonly ssmPath: string
    readonly accessDetails: {
        readonly streamUrl: string
        readonly tokenValue: string
    }
}

/**
 * Checks if the `ssh` daemon is still active or not.
 */
async function checkSession(host: string, sshPath: string): Promise<boolean> {
    const result = await new ChildProcess(sshPath, ['-O', 'check', host]).run({
        onStderr: text => getLogger().debug(`cawsSessionProvider (stderr): ${text}`),
    })

    return result.exitCode === 0
}

type DevEnvId = Pick<CawsDevEnv, 'org' | 'project' | 'developmentWorkspaceId'>
export function createCawsSessionProvider(
    client: ConnectedCawsClient,
    region: string,
    ssmPath: string,
    sshPath = 'ssh'
): SessionProvider {
    return {
        isActive: env => checkSession(getHostNameFromEnv(env), sshPath),
        getDetails: async env => {
            const session = await client.startDevEnvSession({
                projectName: env.project.name,
                organizationName: env.org.name,
                developmentWorkspaceId: env.developmentWorkspaceId,
            })

            if (!session?.sessionId) {
                throw new TypeError('Undefined CAWS workspace session id')
            }

            return {
                region,
                sshPath,
                ssmPath,
                host: getHostNameFromEnv(env),
                id: session.sessionId,
                ...session,
            }
        },
    }
}

interface SessionProvider {
    isActive: (env: DevEnvId) => Promise<boolean>
    getDetails: (env: DevEnvId) => Promise<SessionDetails>
}

/**
 * Creates a new {@link ChildProcess} class bound to a specific CAWS workspace. All instances of this
 * derived class will have SSM session information injected as environment variables as-needed.
 */
export function createBoundProcess(provider: SessionProvider, env: DevEnvId, useSshAgent = true): typeof ChildProcess {
    type Run = ChildProcess['run']

    async function getEnvVars(): Promise<NodeJS.ProcessEnv> {
        if (await provider.isActive(env)) {
            return {}
        }

        const session = await provider.getDetails(env)
        const vars = getMdeSsmEnv(session.region, session.ssmPath, session)

        return useSshAgent ? { [SSH_AGENT_SOCKET_VARIABLE]: await startSshAgent(), ...vars } : vars
    }

    return class SessionBoundProcess extends ChildProcess {
        public override async run(...args: Parameters<Run>): ReturnType<Run> {
            const options = args[0]
            const envVars = await getEnvVars()
            const spawnOptions = {
                ...options?.spawnOptions,
                env: { ...envVars, ...options?.spawnOptions?.env },
            }

            return super.run({ ...options, spawnOptions })
        }
    }
}

export function getHostNameFromEnv(env: DevEnvId): string {
    return `${HOST_NAME_PREFIX}${env.developmentWorkspaceId}`
}
