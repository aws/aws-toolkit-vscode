/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getMdeSsmEnv } from '../mde/mdeModel'
import { CawsDevEnv, ConnectedCawsClient } from '../shared/clients/cawsClient'
import { ChildProcess } from '../shared/utilities/childProcess'

export interface SessionDetails {
    readonly id: string
    readonly region: string
    readonly ssmPath: string
    readonly accessDetails: {
        readonly streamUrl: string
        readonly tokenValue: string
    }
}

type DevEnvId = Pick<CawsDevEnv, 'org' | 'project' | 'developmentWorkspaceId'>
export function cawsSessionProvider(client: ConnectedCawsClient, region: string, ssmPath: string): SessionProvider {
    return {
        create: async (env: DevEnvId) => {
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
                ssmPath,
                id: session.sessionId,
                ...session,
            }
        },
    }
}

interface SessionProvider {
    create: (env: DevEnvId) => Promise<SessionDetails>
    status?: (env: DevEnvId) => Promise<boolean> // stub, maybe not needed
}

interface ActiveSession {
    readonly details: SessionDetails
    readonly processes: ChildProcess[]
}

// Are there a better names than "manager" or "factory" or "provider"?
// Feels overused, though I just can't think of a better name for these things.
export class CawsSessionManager {
    private readonly sessions: Map<string, ActiveSession> = new Map()

    public constructor(private readonly provider: SessionProvider) {}

    private async checkSession(env: DevEnvId): Promise<boolean> {
        const host = `aws-mde-${env.developmentWorkspaceId}`
        const result = await new ChildProcess('ssh', ['-O', 'check', host]).run()

        console.log(`check session stdout: ${result.stdout}`)
        console.log(`check session stderr: ${result.stderr}`)
        console.log(`check session exit: ${result.exitCode}`)

        return result.exitCode !== 0
    }

    private async getSession(env: DevEnvId): Promise<SessionDetails> {
        const prev = this.sessions.get(env.developmentWorkspaceId)

        if (!prev) {
            const sessionDetails = await this.provider.create(env)

            this.sessions.set(env.developmentWorkspaceId, {
                details: sessionDetails,
                processes: [],
            })

            return sessionDetails
        }

        if (!(await this.checkSession(env))) {
            for (const p of prev.processes) {
                p.stop(true)
            }
            this.sessions.delete(env.developmentWorkspaceId)
            return this.getSession(env)
        }

        return prev.details
    }

    public createProcess(env: DevEnvId): typeof ChildProcess {
        type Run = ChildProcess['run']

        const getSession = () => this.getSession(env)

        const removeProcess = (process: ChildProcess) => {
            const current = this.sessions.get(env.developmentWorkspaceId)

            if (!current) {
                return
            }

            const filtered = current.processes.filter(p => p !== process)
            this.sessions.set(env.developmentWorkspaceId, { ...current, processes: filtered })
        }

        const addProcess = (process: ChildProcess) => {
            this.sessions.get(env.developmentWorkspaceId)?.processes?.push(process)
        }

        return class SessionBoundProcess extends ChildProcess {
            public override async run(...args: Parameters<Run>): ReturnType<Run> {
                const options = args[0]
                const session = await getSession()
                const spawnOptions = {
                    ...options?.spawnOptions,
                    env: {
                        ...getMdeSsmEnv(session.region, session.ssmPath, session),
                        ...options?.spawnOptions?.env,
                    },
                }

                const result = super.run({ ...options, spawnOptions })
                const process = this.getProcess()

                process.on('error', e => {
                    removeProcess(this)
                })

                process.on('exit', (code, signal) => {
                    removeProcess(this)
                })

                addProcess(this)

                return result
            }
        }
    }
}
