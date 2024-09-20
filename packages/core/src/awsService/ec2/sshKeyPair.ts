/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs-extra'
import { ToolkitError } from '../../shared/errors'
import { ChildProcess } from '../../shared/utilities/childProcess'
import { tryRun } from '../../shared/utilities/pathFind'

type sshKeyType = 'ed25519' | 'rsa'

export class SshKeyPair {
    private publicKeyPath: string
    private constructor(keyPath: string) {
        this.publicKeyPath = `${keyPath}.pub`
    }

    public static async getSshKeyPair(keyPath: string) {
        const keyExists = await fs.pathExists(keyPath)
        if (!keyExists) {
            await SshKeyPair.generateSshKeyPair(keyPath)
        }
        return new SshKeyPair(keyPath)
    }

    public static async generateSshKeyPair(keyPath: string): Promise<void> {
        const process = new ChildProcess(`ssh-keygen`, ['-t', await this.getKeyType(), '-N', '', '-q', '-f', keyPath])
        const result = await process.run()
        if (result.exitCode !== 0) {
            throw new ToolkitError('ec2: Failed to generate ssh key', { details: { stdout: result.stdout } })
        }
    }

    private static async getKeyType(): Promise<sshKeyType> {
        return (await this.isEd25519Supported()) ? 'ed25519' : 'rsa'
    }

    public static async isEd25519Supported(): Promise<boolean> {
        return !(await tryRun('ssh-keygen', ['-t', 'ed25519', '-N', '', '-q'], 'yes', 'unknown key type'))
    }

    public getPublicKeyPath(): string {
        return this.publicKeyPath
    }

    public async getPublicKey(): Promise<string> {
        const contents = await fs.readFile(this.publicKeyPath, 'utf-8')
        return contents
    }
}
