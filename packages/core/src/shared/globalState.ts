/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from './extensionGlobals'
import { getLogger } from './logger/logger'

type globalKey =
    | 'gumby.wasQCodeTransformationUsed'
    | 'aws.toolkit.amazonq.dismissed'
    | 'aws.toolkit.amazonqInstall.dismissed'
    | 'hasAlreadyOpenedAmazonQ'
    | 'aws.lastTouchedS3Folder'
    | 'aws.lastUploadedToS3Folder'
    | 'aws.downloadPath'
    | 'CODECATALYST_RECONNECT'
    | 'CODEWHISPERER_USER_GROUP'

export class GlobalState implements vscode.Memento {
    static #instance: GlobalState
    static get instance(): GlobalState {
        return (this.#instance ??= new GlobalState())
    }

    public keys(): readonly string[] {
        return globals.context.globalState.keys()
    }

    public get<T>(key: globalKey, defaultValue?: T): T | undefined {
        return globals.context.globalState.get(key) ?? defaultValue
    }

    /** Asynchronously updates globalState, or logs an error on failure. */
    public tryUpdate(key: globalKey, value: any): void {
        globals.context.globalState.update(key, value).then(
            undefined, // TODO: log.debug() ?
            e => {
                getLogger().error('GlobalState: failed to set "%s": %s', key, (e as Error).message)
            }
        )
    }

    public update(key: globalKey, value: any): Thenable<void> {
        return globals.context.globalState.update(key, value)
    }

    public static samAndCfnSchemaDestinationUri() {
        return vscode.Uri.joinPath(globals.context.globalStorageUri, 'sam.schema.json')
    }
}

export const globalState = GlobalState.instance
export default globalState
