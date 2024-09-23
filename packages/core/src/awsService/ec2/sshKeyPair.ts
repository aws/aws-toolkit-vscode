/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { fs } from '../../shared'
import { chmodSync } from 'fs'
import { ToolkitError } from '../../shared/errors'
import { ChildProcess } from '../../shared/utilities/childProcess'
import { Timeout } from '../../shared/utilities/timeoutUtils'

export class SshKeyPair {
    private publicKeyPath: string
    private lifeTimeout: Timeout
    private deleted: boolean = false

    private constructor(
        private keyPath: string,
        lifetime: number
    ) {
        this.publicKeyPath = `${keyPath}.pub`
        this.lifeTimeout = new Timeout(lifetime)

        this.lifeTimeout.onCompletion(async () => {
            await this.delete()
        })
    }

    public static async getSshKeyPair(keyPath: string, lifetime: number) {
        // Overwrite key if already exists
        if (await fs.existsFile(keyPath)) {
            await fs.delete(keyPath)
        }
        await SshKeyPair.generateSshKeyPair(keyPath)
        return new SshKeyPair(keyPath, lifetime)
    }

    public static async generateSshKeyPair(keyPath: string): Promise<void> {
        const process = new ChildProcess(`ssh-keygen`, ['-t', 'ed25519', '-N', '', '-q', '-f', keyPath])
        const result = await process.run()
        if (result.exitCode !== 0) {
            throw new ToolkitError('ec2: Failed to generate ssh key', { details: { stdout: result.stdout } })
        }
        chmodSync(keyPath, 0o600)
    }

    public getPublicKeyPath(): string {
        return this.publicKeyPath
    }

    public getPrivateKeyPath(): string {
        return this.keyPath
    }

    public async getPublicKey(): Promise<string> {
        const contents = await fs.readFileAsString(this.publicKeyPath)
        return contents
    }

    public async delete(): Promise<void> {
        await fs.delete(this.keyPath)
        await fs.delete(this.publicKeyPath)

        if (!this.lifeTimeout.completed) {
            this.lifeTimeout.cancel()
        }

        this.deleted = true
    }

    public isDeleted(): boolean {
        return this.deleted
    }

    public timeAlive(): number {
        return this.lifeTimeout.elapsedTime
    }
}
