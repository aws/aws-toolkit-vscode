/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs'
import * as vscode from 'vscode'
import fs2 from '../shared/fs/fs'

/**
 * Deprecated interface for filesystem operations.
 *
 * @deprecated Use `core/src/shared/fs.ts` instead
 */
export class SystemUtilities {
    public static getHomeDirectory(): string {
        return fs2.getUserHomeDir()
    }

    public static async readFile(file: string | vscode.Uri, decoder: TextDecoder = new TextDecoder()): Promise<string> {
        return fs2.readFileAsString(file, decoder)
    }

    public static async writeFile(
        file: string | vscode.Uri,
        data: string | Buffer,
        opt?: fs.WriteFileOptions
    ): Promise<void> {
        return fs2.writeFile(file, data, opt)
    }

    public static async delete(fileOrDir: string | vscode.Uri, opt?: { recursive: boolean }): Promise<void> {
        await fs2.delete(fileOrDir, opt)
    }

    public static async fileExists(file: string | vscode.Uri): Promise<boolean> {
        return fs2.exists(file)
    }
}
