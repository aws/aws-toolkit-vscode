/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { Session } from 'aws-sdk/clients/ssm'
import { EC2, IAM, SSM } from 'aws-sdk'
import { Ec2Selection } from './prompter'
import { getOrInstallCli } from '../../shared/utilities/cliUtils'
import { isCloud9 } from '../../shared/extensionUtilities'
import { ToolkitError } from '../../shared/errors'
import { SsmClient } from '../../shared/clients/ssmClient'
import { Ec2Client } from '../../shared/clients/ec2Client'
import {
    VscodeRemoteConnection,
    createBoundProcess,
    ensureDependencies,
    getDeniedSsmActions,
    openRemoteTerminal,
    promptToAddInlinePolicy,
} from '../../shared/remoteSession'
import { DefaultIamClient } from '../../shared/clients/iamClient'
import { ErrorInformation } from '../../shared/errors'
import {
    sshAgentSocketVariable,
    SshError,
    startSshAgent,
    startVscodeRemote,
    testSshConnection,
} from '../../shared/extensions/ssh'
import { getLogger } from '../../shared/logger/logger'
import { CancellationError, Timeout } from '../../shared/utilities/timeoutUtils'
import { showMessageWithCancel } from '../../shared/utilities/messages'
import { SshConfig } from '../../shared/sshConfig'
import { SshKeyPair } from './sshKeyPair'
import { Ec2SessionTracker } from './remoteSessionManager'
import { getEc2SsmEnv } from './utils'

export type Ec2ConnectErrorCode = 'EC2SSMStatus' | 'EC2SSMPermission' | 'EC2SSMConnect' | 'EC2SSMAgentStatus'

export interface Ec2RemoteEnv extends VscodeRemoteConnection {
    selection: Ec2Selection
    keyPair: SshKeyPair
    ssmSession: SSM.StartSessionResponse
}

export class Ec2Connecter implements vscode.Disposable {
    protected ssmClient: SsmClient
    protected ec2Client: Ec2Client
    protected iamClient: DefaultIamClient
    protected sessionManager: Ec2SessionTracker

    private policyDocumentationUri = vscode.Uri.parse(
        'https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-instance-profile.html'
    )

    private ssmAgentDocumentationUri = vscode.Uri.parse(
        'https://docs.aws.amazon.com/systems-manager/latest/userguide/ssm-agent.html'
    )

    public constructor(readonly regionCode: string) {
        this.ssmClient = this.createSsmSdkClient()
        this.ec2Client = this.createEc2SdkClient()
        this.iamClient = this.createIamSdkClient()
        this.sessionManager = new Ec2SessionTracker(regionCode, this.ssmClient)
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

    public async addActiveSession(sessionId: SSM.SessionId, instanceId: EC2.InstanceId): Promise<void> {
        await this.sessionManager.addSession(instanceId, sessionId)
    }

    public async dispose(): Promise<void> {
        await this.sessionManager.dispose()
    }

    public isConnectedTo(instanceId: string): boolean {
        return this.sessionManager.isConnectedTo(instanceId)
    }

    public async getAttachedIamRole(instanceId: string): Promise<IAM.Role | undefined> {
        const IamInstanceProfile = await this.ec2Client.getAttachedIamInstanceProfile(instanceId)
        if (IamInstanceProfile && IamInstanceProfile.Arn) {
            const IamRole = await this.iamClient.getIAMRoleFromInstanceProfile(IamInstanceProfile.Arn)
            return IamRole
        }
    }

    public async hasProperPermissions(IamRoleArn: string): Promise<boolean> {
        const deniedActions = await getDeniedSsmActions(this.iamClient, IamRoleArn)

        return deniedActions.length === 0
    }

    public async isInstanceRunning(instanceId: string): Promise<boolean> {
        const instanceStatus = await this.ec2Client.getInstanceStatus(instanceId)
        return instanceStatus === 'running'
    }

    protected throwConnectionError(message: string, selection: Ec2Selection, errorInfo: ErrorInformation) {
        const generalErrorMessage = `Unable to connect to target instance ${selection.instanceId} on region ${selection.region}. `
        throw new ToolkitError(generalErrorMessage + message, errorInfo)
    }

    private async checkForInstanceStatusError(selection: Ec2Selection): Promise<void> {
        const isInstanceRunning = await this.isInstanceRunning(selection.instanceId)

        if (!isInstanceRunning) {
            const message = 'Ensure the target instance is running.'
            this.throwConnectionError(message, selection, { code: 'EC2SSMStatus' })
        }
    }

    private async checkForInstancePermissionsError(selection: Ec2Selection): Promise<void> {
        const IamRole = await this.getAttachedIamRole(selection.instanceId)

        if (!IamRole) {
            const message = `No IAM role attached to instance: ${selection.instanceId}`
            this.throwConnectionError(message, selection, {
                code: 'EC2SSMPermission',
                documentationUri: this.policyDocumentationUri,
            })
        }

        const hasPermission = await this.hasProperPermissions(IamRole!.Arn)

        if (!hasPermission) {
            const policiesAdded = await promptToAddInlinePolicy(this.iamClient, IamRole!.Arn!)

            if (!policiesAdded) {
                throw new CancellationError('user')
            }
        }
    }

    private async checkForInstanceSsmError(selection: Ec2Selection): Promise<void> {
        const isSsmAgentRunning = (await this.ssmClient.getInstanceAgentPingStatus(selection.instanceId)) === 'Online'

        if (!isSsmAgentRunning) {
            this.throwConnectionError('Is SSM Agent running on the target instance?', selection, {
                code: 'EC2SSMAgentStatus',
                documentationUri: this.ssmAgentDocumentationUri,
            })
        }
    }

    public async checkForStartSessionError(selection: Ec2Selection): Promise<void> {
        await this.checkForInstanceStatusError(selection)

        await this.checkForInstancePermissionsError(selection)

        await this.checkForInstanceSsmError(selection)
    }

    private async openSessionInTerminal(session: Session, selection: Ec2Selection) {
        const ssmPlugin = await getOrInstallCli('session-manager-plugin', !isCloud9)
        const shellArgs = [JSON.stringify(session), selection.region, 'StartSession']
        const terminalOptions = {
            name: `${selection.region}/${selection.instanceId}`,
            shellPath: ssmPlugin,
            shellArgs: shellArgs,
        }

        await openRemoteTerminal(terminalOptions, () => this.ssmClient.terminateSession(session)).catch((err) => {
            throw ToolkitError.chain(err, 'Failed to open ec2 instance.')
        })
    }

    public async attemptToOpenEc2Terminal(selection: Ec2Selection): Promise<void> {
        await this.checkForStartSessionError(selection)
        try {
            const response = await this.ssmClient.startSession(selection.instanceId)
            await this.openSessionInTerminal(response, selection)
        } catch (err: unknown) {
            this.throwConnectionError('', selection, err as Error)
        }
    }

    public async tryOpenRemoteConnection(selection: Ec2Selection): Promise<void> {
        await this.checkForStartSessionError(selection)

        const remoteUser = await this.getRemoteUser(selection.instanceId)
        const remoteEnv = await this.prepareEc2RemoteEnvWithProgress(selection, remoteUser)
        const testSession = await this.ssmClient.startSession(selection.instanceId, 'AWS-StartSSHSession')
        try {
            await testSshConnection(
                remoteEnv.SessionProcess,
                remoteEnv.hostname,
                remoteEnv.sshPath,
                remoteUser,
                testSession
            )
            await startVscodeRemote(remoteEnv.SessionProcess, remoteEnv.hostname, '/', remoteEnv.vscPath, remoteUser)
        } catch (err) {
            const message = err instanceof SshError ? 'Testing SSH connection to instance failed' : ''
            this.throwConnectionError(message, selection, err as Error)
        } finally {
            await this.ssmClient.terminateSession(testSession)
        }
    }

    public async prepareEc2RemoteEnvWithProgress(selection: Ec2Selection, remoteUser: string): Promise<Ec2RemoteEnv> {
        const timeout = new Timeout(60000)
        await showMessageWithCancel('AWS: Opening remote connection...', timeout)
        const remoteEnv = await this.prepareEc2RemoteEnv(selection, remoteUser).finally(() => timeout.cancel())
        return remoteEnv
    }

    private async startSSMSession(instanceId: string): Promise<SSM.StartSessionResponse> {
        const ssmSession = await this.ssmClient.startSession(instanceId, 'AWS-StartSSHSession')
        await this.addActiveSession(instanceId, ssmSession.SessionId!)
        return ssmSession
    }

    public async prepareEc2RemoteEnv(selection: Ec2Selection, remoteUser: string): Promise<Ec2RemoteEnv> {
        const logger = this.configureRemoteConnectionLogger(selection.instanceId)
        const { ssm, vsc, ssh } = (await ensureDependencies()).unwrap()
        const keyPair = await this.configureSshKeys(selection, remoteUser)
        const hostnamePrefix = 'aws-ec2-'
        const hostname = `${hostnamePrefix}${selection.instanceId}`
        const sshConfig = new SshConfig(ssh, hostnamePrefix, 'ec2_connect', keyPair.getPrivateKeyPath())

        const config = await sshConfig.ensureValid()
        if (config.isErr()) {
            const err = config.err()
            getLogger().error(`ec2: failed to add ssh config section: ${err.message}`)

            throw err
        }

        const ssmSession = await this.startSSMSession(selection.instanceId)

        const vars = getEc2SsmEnv(selection, ssm, ssmSession)
        getLogger().debug(`ec2: connect script logs at ${vars.LOG_FILE_LOCATION}`)

        const envProvider = async () => {
            return { [sshAgentSocketVariable]: await startSshAgent(), ...vars }
        }
        const SessionProcess = createBoundProcess(envProvider).extend({
            onStdout: logger,
            onStderr: logger,
            rejectOnErrorCode: true,
        })

        return {
            hostname,
            envProvider,
            sshPath: ssh,
            vscPath: vsc,
            SessionProcess,
            selection,
            keyPair,
            ssmSession,
        }
    }

    private configureRemoteConnectionLogger(instanceId: string) {
        const logPrefix = `ec2 (${instanceId})`
        const logger = (data: string) => getLogger().verbose(`${logPrefix}: ${data}`)
        return logger
    }

    public async configureSshKeys(selection: Ec2Selection, remoteUser: string): Promise<SshKeyPair> {
        const keyPair = await SshKeyPair.getSshKeyPair(`aws-ec2-key`, 30000)
        await this.sendSshKeyToInstance(selection, keyPair, remoteUser)
        return keyPair
    }

    public async sendSshKeyToInstance(
        selection: Ec2Selection,
        sshKeyPair: SshKeyPair,
        remoteUser: string
    ): Promise<void> {
        const sshPubKey = await sshKeyPair.getPublicKey()

        const remoteAuthorizedKeysPaths = `/home/${remoteUser}/.ssh/authorized_keys`
        const command = `echo "${sshPubKey}" > ${remoteAuthorizedKeysPaths}`
        const documentName = 'AWS-RunShellScript'

        await this.ssmClient.sendCommandAndWait(selection.instanceId, documentName, {
            commands: [command],
        })
    }

    public async getRemoteUser(instanceId: string) {
        const osName = await this.ssmClient.getTargetPlatformName(instanceId)
        if (osName === 'Amazon Linux') {
            return 'ec2-user'
        }

        if (osName === 'Ubuntu') {
            return 'ubuntu'
        }

        throw new ToolkitError(`Unrecognized OS name ${osName} on instance ${instanceId}`, { code: 'UnknownEc2OS' })
    }
}
