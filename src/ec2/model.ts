/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { Session } from 'aws-sdk/clients/ssm'
import { IAM } from 'aws-sdk'
import { Ec2Selection } from './utils'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import { isCloud9 } from '../shared/extensionUtilities'
import { ToolkitError } from '../shared/errors'
import { SsmClient } from '../shared/clients/ssmClient'
import { Ec2Client } from '../shared/clients/ec2Client'
import { VscodeRemoteConnection, ensureDependencies, openRemoteTerminal } from '../shared/remoteSession'
import { DefaultIamClient } from '../shared/clients/iamClient'
import { ErrorInformation } from '../shared/errors'
import { sshAgentSocketVariable, startSshAgent, startVscodeRemote } from '../shared/extensions/ssh'
import { createBoundProcess } from '../codecatalyst/model'
import { getLogger } from '../shared/logger/logger'
import { Timeout } from '../shared/utilities/timeoutUtils'
import { showMessageWithCancel } from '../shared/utilities/messages'

export type Ec2ConnectErrorCode = 'EC2SSMStatus' | 'EC2SSMPermission' | 'EC2SSMConnect' | 'EC2SSMAgentStatus'

interface Ec2RemoteEnv extends VscodeRemoteConnection {
    selection: Ec2Selection
}

export class Ec2ConnectionManager {
    private ssmClient: SsmClient
    private ec2Client: Ec2Client
    private iamClient: DefaultIamClient

    public constructor(readonly regionCode: string) {
        this.ssmClient = this.createSsmSdkClient()
        this.ec2Client = this.createEc2SdkClient()
        this.iamClient = this.createIamSdkClient()
    }

    protected createSsmSdkClient(): SsmClient {
        return new SsmClient(this.regionCode)
    }

    protected createEc2SdkClient(): Ec2Client {
        return new Ec2Client(this.regionCode)
    }

    protected createIamSdkClient(): DefaultIamClient {
        return new DefaultIamClient(this.regionCode)
    }

    protected async getAttachedPolicies(instanceId: string): Promise<IAM.attachedPoliciesListType> {
        const IamRole = await this.ec2Client.getAttachedIamRole(instanceId)
        if (!IamRole) {
            return []
        }
        const iamResponse = await this.iamClient.listAttachedRolePolicies(IamRole!.Arn!)

        return iamResponse.AttachedPolicies ?? []
    }

    public async hasProperPolicies(instanceId: string): Promise<boolean> {
        const attachedPolicies = (await this.getAttachedPolicies(instanceId)).map(policy => policy.PolicyName!)
        const requiredPolicies = ['AmazonSSMManagedInstanceCore', 'AmazonSSMManagedEC2InstanceDefaultPolicy']

        return requiredPolicies.length !== 0 && requiredPolicies.every(policy => attachedPolicies.includes(policy))
    }

    public async isInstanceRunning(instanceId: string): Promise<boolean> {
        const instanceStatus = await this.ec2Client.getInstanceStatus(instanceId)
        return instanceStatus == 'running'
    }

    private throwConnectionError(message: string, selection: Ec2Selection, errorInfo: ErrorInformation) {
        const generalErrorMessage = `Unable to connect to target instance ${selection.instanceId} on region ${selection.region}. `
        throw new ToolkitError(generalErrorMessage + message, errorInfo)
    }

    public async checkForStartSessionError(selection: Ec2Selection): Promise<void> {
        const isInstanceRunning = await this.isInstanceRunning(selection.instanceId)
        const hasProperPolicies = await this.hasProperPolicies(selection.instanceId)
        const isSsmAgentRunning = (await this.ssmClient.getInstanceAgentPingStatus(selection.instanceId)) == 'Online'

        if (!isInstanceRunning) {
            const message = 'Ensure the target instance is running and not currently starting, stopping, or stopped.'
            this.throwConnectionError(message, selection, { code: 'EC2SSMStatus' })
        }

        if (!hasProperPolicies) {
            const message = 'Ensure the IAM role attached to the instance has the required policies.'
            const documentationUri = vscode.Uri.parse(
                'https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-instance-profile.html'
            )
            this.throwConnectionError(message, selection, {
                code: 'EC2SSMPermission',
                documentationUri: documentationUri,
            })
        }

        if (!isSsmAgentRunning) {
            this.throwConnectionError('Is SSM Agent running on the target instance?', selection, {
                code: 'EC2SSMAgentStatus',
                documentationUri: vscode.Uri.parse(
                    'https://docs.aws.amazon.com/systems-manager/latest/userguide/ssm-agent.html'
                ),
            })
        }
    }

    public throwGeneralConnectionError(selection: Ec2Selection, error: Error) {
        this.throwConnectionError('Unable to connect to target instance. ', selection, {
            code: 'EC2SSMConnect',
            cause: error,
        })
    }

    private async openSessionInTerminal(session: Session, selection: Ec2Selection) {
        const ssmPlugin = await getOrInstallCli('session-manager-plugin', !isCloud9)
        const shellArgs = [JSON.stringify(session), selection.region, 'StartSession']
        const terminalOptions = {
            name: selection.region + '/' + selection.instanceId,
            shellPath: ssmPlugin,
            shellArgs: shellArgs,
        }

        await openRemoteTerminal(terminalOptions, () => this.ssmClient.terminateSession(session)).catch(err => {
            throw ToolkitError.chain(err, 'Failed to open ec2 instance.')
        })
    }

    public async attemptToOpenEc2Terminal(selection: Ec2Selection): Promise<void> {
        await this.checkForStartSessionError(selection)
        try {
            const response = await this.ssmClient.startSession(selection.instanceId)
            await this.openSessionInTerminal(response, selection)
        } catch (err: unknown) {
            this.throwGeneralConnectionError(selection, err as Error)
        }
    }

    public async attemptToOpenRemoteConnection(selection: Ec2Selection): Promise<void> {
        await this.checkForStartSessionError(selection)
        const timeout = new Timeout(60000)
        await showMessageWithCancel('AWS: Opening remote connection...', timeout)
        const remoteEnv = await this.prepareEc2RemoteEnv(selection)
        try {
            await startVscodeRemote(remoteEnv.SessionProcess, selection.instanceId, '/', remoteEnv.vscPath)
        } catch (err) {
            this.throwGeneralConnectionError(selection, err as Error)
        } finally {
            timeout.cancel()
        }
    }

    public async prepareEc2RemoteEnv(selection: Ec2Selection): Promise<Ec2RemoteEnv> {
        const logger = this.configureRemoteConnectionLogger(selection.instanceId)
        const { ssm, vsc, ssh } = (await ensureDependencies()).unwrap()
        const vars = getEc2SsmEnv(selection.region, ssm)
        const envProvider = async () => {
            return { [sshAgentSocketVariable]: await startSshAgent(), ...vars }
        }
        const SessionProcess = createBoundProcess(envProvider).extend({
            onStdout: logger,
            onStderr: logger,
            rejectOnErrorCode: true,
        })

        return {
            hostname: selection.instanceId,
            envProvider,
            sshPath: ssh,
            vscPath: vsc,
            SessionProcess,
            selection,
        }
    }

    private configureRemoteConnectionLogger(instanceId: string) {
        const logPrefix = `ec2 (${instanceId})`
        const logger = (data: string) => getLogger().verbose(`${logPrefix}: ${data}`)
        return logger
    }
}

function getEc2SsmEnv(region: string, ssmPath: string): NodeJS.ProcessEnv {
    return Object.assign(
        {
            AWS_REGION: region,
            AWS_SSM_CLI: ssmPath,
        },
        process.env
    )
}
