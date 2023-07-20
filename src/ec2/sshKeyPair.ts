/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs-extra'
import { ToolkitError } from '../shared/errors'
import { ChildProcess } from '../shared/utilities/childProcess'

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

    public static async generateSshKeyPair(keyPath: string) {
        const process = new ChildProcess(`ssh-keygen`, ['-t', 'rsa', '-N', '', '-q', '-f', keyPath])
        const result = await process.run()
        if (result.exitCode !== 0) {
            throw new ToolkitError('ec2: Failed to generate ssh key')
        }
    }

    public getPublicKeyPath(): string {
        return this.publicKeyPath
    }

    public async getPublicKey(): Promise<string> {
        const contents = await fs.readFile(this.publicKeyPath, 'utf-8')
        return contents
    }
}
