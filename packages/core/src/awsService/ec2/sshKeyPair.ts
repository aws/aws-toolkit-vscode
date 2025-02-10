/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import os from 'os'
import globals from '../../shared/extensionGlobals'
import { fs } from '../../shared/fs/fs'
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
        this.publicKeyPath = `${this.keyPath}.pub`
        this.lifeTimeout = new Timeout(lifetime)

        this.lifeTimeout.onCompletion(async () => {
            await this.delete()
        })
    }

    private static getKeypath(keyName: string): string {
        return path.join(globals.context.globalStorageUri.fsPath, keyName)
    }

    public static async getSshKeyPair(keyName: string, lifetime: number) {
        const keyPath = SshKeyPair.getKeypath(keyName)
        await SshKeyPair.generateSshKeyPair(keyPath)
        return new SshKeyPair(keyPath, lifetime)
    }

    private static isValidKeyPath(keyPath: string): boolean {
        const relative = path.relative(globals.context.globalStorageUri.fsPath, keyPath)
        return relative !== undefined && !relative.startsWith('..') && !path.isAbsolute(relative) && keyPath.length > 4
    }

    private static assertValidKeypath(keyPath: string, message: string): void | never {
        if (!SshKeyPair.isValidKeyPath(keyPath)) {
            throw new ToolkitError(message)
        }
    }

    private static async assertGenerated(keyPath: string, keyGenerated: boolean): Promise<never | void> {
        if (!keyGenerated) {
            throw new ToolkitError('ec2: Unable to generate ssh key pair with either ed25519 or rsa')
        }

        if (!(await fs.exists(keyPath))) {
            throw new ToolkitError(`ec2: Failed to generate keys, resulting key not found at ${keyPath}`)
        }
    }

    public static async generateSshKeyPair(keyPath: string): Promise<void> {
        const keyGenerated = await SshKeyPair.tryKeyTypes(keyPath, ['ed25519', 'rsa'])
        // Should already be the case, but just in case we assert permissions.
        // skip on Windows since it only allows write permission to be changed.
        if (!globals.isWeb && os.platform() !== 'win32') {
            await fs.chmod(keyPath, 0o600)
            await SshKeyPair.assertGenerated(keyPath, keyGenerated)
        }
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
            timeout: new Timeout(5000),
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
        SshKeyPair.assertValidKeypath(
            this.keyPath,
            `ec2: keyPath became invalid after creation, not deleting key at ${this.keyPath}`
        )
        await fs.delete(this.keyPath, { force: true })
        await fs.delete(this.publicKeyPath, { force: true })

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
