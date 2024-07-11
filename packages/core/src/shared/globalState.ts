/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from './logger/logger'

type globalKey =
    | 'aws.downloadPath'
    | 'aws.lastTouchedS3Folder'
    | 'aws.lastUploadedToS3Folder'
    | 'aws.toolkit.amazonq.dismissed'
    | 'aws.toolkit.amazonqInstall.dismissed'
    // Deprecated/legacy names. New keys should start with "aws.".
    | 'CODECATALYST_RECONNECT'
    | 'CODEWHISPERER_USER_GROUP'
    | 'gumby.wasQCodeTransformationUsed'
    | 'hasAlreadyOpenedAmazonQ'

/**
 * Extension-local, shared state which persists after IDE restart. Shared with all instances (or
 * tabs, in a web browser) of this extension for a given user, but not visible to other vscode
 * extensions. Global state should be avoided, except when absolutely necessary.
 *
 * This wrapper adds structure and visibility to the vscode `globalState` interface. It also opens
 * the door for:
 * - validation
 * - garbage collection
 */
export class GlobalState implements vscode.Memento {
    public constructor(private readonly extContext: vscode.ExtensionContext) {}

    public keys(): readonly string[] {
        return this.extContext.globalState.keys()
    }

    public get<T>(key: globalKey, defaultValue?: T): T | undefined {
        return this.extContext.globalState.get(key) ?? defaultValue
    }

    /** Asynchronously updates globalState, or logs an error on failure. */
    public tryUpdate(key: globalKey, value: any): void {
        this.extContext.globalState.update(key, value).then(
            undefined, // TODO: log.debug() ?
            e => {
                getLogger().error('GlobalState: failed to set "%s": %s', key, (e as Error).message)
            }
        )
    }

    public update(key: globalKey, value: any): Thenable<void> {
        return this.extContext.globalState.update(key, value)
    }

    public samAndCfnSchemaDestinationUri() {
        return vscode.Uri.joinPath(this.extContext.globalStorageUri, 'sam.schema.json')
    }
}
