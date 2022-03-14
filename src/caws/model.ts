/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getMdeSsmEnv } from '../mde/mdeModel'
import { CawsDevEnv, ConnectedCawsClient } from '../shared/clients/cawsClient'
import { getLogger } from '../shared/logger/logger'
import { ChildProcess } from '../shared/utilities/childProcess'

interface OldSessionDetails {
    readonly type: 'old'
}

interface NewSessionDetails {
    readonly type: 'new'
    readonly id: string
    readonly region: string
    readonly ssmPath: string
    readonly accessDetails: {
        readonly streamUrl: string
        readonly tokenValue: string
    }
}

type SessionDetails = OldSessionDetails | NewSessionDetails

/**
 * Checks if the `ssh` daemon is still active or not.
 */
async function checkSession(env: DevEnvId): Promise<boolean> {
    const host = `aws-mde-${env.developmentWorkspaceId}`
    const result = await new ChildProcess('ssh', ['-O', 'check', host]).run()

    getLogger().debug(`cawsSessionProvider: check session stdout: ${result.stdout}`)
    getLogger().debug(`cawsSessionProvider: check session stderr: ${result.stderr}`)
    getLogger().debug(`cawsSessionProvider: check session exit: ${result.exitCode}`)

    return result.exitCode !== 0
}

type DevEnvId = Pick<CawsDevEnv, 'org' | 'project' | 'developmentWorkspaceId'>
export function createCawsSessionProvider(
    client: ConnectedCawsClient,
    region: string,
    ssmPath: string
): SessionProvider {
    return {
        get: async (env: DevEnvId) => {
            if (await checkSession(env)) {
                return { type: 'old' }
            }

            const session = await client.startDevEnvSession({
                projectName: env.project.name,
                organizationName: env.org.name,
                developmentWorkspaceId: env.developmentWorkspaceId,
            })

            if (!session?.sessionId) {
                throw new TypeError('Undefined CAWS workspace session id')
            }

            return {
                type: 'new',
                region,
                ssmPath,
                id: session.sessionId,
                ...session,
            }
        },
    }
}

interface SessionProvider {
    get: (env: DevEnvId) => Promise<SessionDetails>
    status?: (env: DevEnvId) => Promise<boolean> // stub, maybe not needed
}

/**
 * Creates a new {@link ChildProcess} class bound to a specific CAWS workspace. All instances of this
 * derived class will have SSM session information injected as environment variables as-needed.
 */
export function createBoundChildProcess(provider: SessionProvider, env: DevEnvId): typeof ChildProcess {
    type Run = ChildProcess['run']

    return class SessionBoundProcess extends ChildProcess {
        public override async run(...args: Parameters<Run>): ReturnType<Run> {
            const options = args[0]
            const session = await provider.get(env)
            const envVars = session.type === 'new' ? getMdeSsmEnv(session.region, session.ssmPath, session) : {}
            const spawnOptions = {
                ...options?.spawnOptions,
                env: { ...envVars, ...options?.spawnOptions?.env },
            }

            return super.run({ ...options, spawnOptions })
        }
    }
}
