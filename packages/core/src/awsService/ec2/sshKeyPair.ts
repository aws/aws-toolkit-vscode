/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { fs, globals } from '../../shared'
import { ToolkitError } from '../../shared/errors'
import { tryRun } from '../../shared/utilities/pathFind'
import { Timeout } from '../../shared/utilities/timeoutUtils'
import { findAsync } from '../../shared/utilities/collectionUtils'
import { RunParameterContext } from '../../shared/utilities/processUtils'
import path from 'path'

type sshKeyType = 'rsa' | 'ed25519'

export class SshKeyPair {
    private publicKeyPath: string
    private lifeTimeout: Timeout

    private constructor(
        private readonly keyPath: string,
        lifetime: number
    ) {
        this.publicKeyPath = `${keyPath}.pub`
        this.lifeTimeout = new Timeout(lifetime)

        this.lifeTimeout.onCompletion(async () => {
            await this.delete()
        })
    }

    public static async getSshKeyPair(keyPath: string, lifetime: number) {
        const validKey = SshKeyPair.isValidKeyPath(keyPath)
        if (!validKey) {
            throw new ToolkitError(`ec2: unable to generate key outside of global storage in path ${keyPath}`)
        }
        await SshKeyPair.generateSshKeyPair(keyPath)
        return new SshKeyPair(keyPath, lifetime)
    }

    private static isValidKeyPath(keyPath: string): boolean {
        const relative = path.relative(globals.context.globalStorageUri.fsPath, keyPath)
        return relative !== undefined && !relative.startsWith('..') && !path.isAbsolute(relative)
    }

    public static async generateSshKeyPair(keyPath: string): Promise<void> {
        const keyGenerated = await this.tryKeyTypes(keyPath, ['ed25519', 'rsa'])
        if (!keyGenerated) {
            throw new ToolkitError('ec2: Unable to generate ssh key pair')
        }
        await fs.chmod(keyPath, 0o600)
    }
    /**
     * Attempts to generate an ssh key pair. Returns true if successful, false otherwise.
     * @param keyPath where to generate key.
     * @param keyType type of key to generate.
     */
    public static async tryKeyGen(keyPath: string, keyType: sshKeyType): Promise<boolean> {
        const overrideKeys = async (_t: string, proc: RunParameterContext) => {
            await proc.send('yes')
        }
        return !(await tryRun('ssh-keygen', ['-t', keyType, '-N', '', '-q', '-f', keyPath], 'yes', 'unknown key type', {
            onStdout: overrideKeys,
        }))
    }

    public static async tryKeyTypes(keyPath: string, keyTypes: sshKeyType[]): Promise<boolean> {
        const keyTypeUsed = await findAsync(keyTypes, async (type) => await this.tryKeyGen(keyPath, type))
        return keyTypeUsed !== undefined
    }

    public getPublicKeyPath(): string {
        return this.publicKeyPath
    }

    public getPrivateKeyPath(): string {
        return this.keyPath
    }

    public async getPublicKey(): Promise<string> {
        const contents = await fs.readFileText(this.publicKeyPath)
        return contents
    }

    public async delete(): Promise<void> {
        await fs.delete(this.keyPath)
        await fs.delete(this.publicKeyPath)

        if (!this.lifeTimeout.completed) {
            this.lifeTimeout.cancel()
        }
    }

    public async isDeleted(): Promise<boolean> {
        const privateKeyDeleted = !(await fs.existsFile(this.getPrivateKeyPath()))
        const publicKeyDeleted = !(await fs.existsFile(this.getPublicKeyPath()))
        return privateKeyDeleted || publicKeyDeleted
    }

    public timeAlive(): number {
        return this.lifeTimeout.elapsedTime
    }
}
