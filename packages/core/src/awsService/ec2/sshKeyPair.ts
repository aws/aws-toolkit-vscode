/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs-extra'
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
        if (await fs.pathExists(keyPath)) {
            await fs.remove(keyPath)
        }
        await SshKeyPair.generateSshKeyPair(keyPath)
        return new SshKeyPair(keyPath, lifetime)
    }

    public static async generateSshKeyPair(keyPath: string): Promise<void> {
        const process = new ChildProcess(`ssh-keygen`, ['-t', 'rsa', '-N', '', '-q', '-f', keyPath])
        const result = await process.run()
        if (result.exitCode !== 0) {
            throw new ToolkitError('ec2: Failed to generate ssh key', { details: { stdout: result.stdout } })
        }
        await fs.chmod(keyPath, 0o600)
    }

    public getPublicKeyPath(): string {
        return this.publicKeyPath
    }

    public getPrivateKeyPath(): string {
        return this.keyPath
    }

    public async getPublicKey(): Promise<string> {
        const contents = await fs.readFile(this.publicKeyPath, 'utf-8')
        return contents
    }

    public async delete(): Promise<void> {
        await fs.remove(this.publicKeyPath)
        await fs.remove(this.keyPath)

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
