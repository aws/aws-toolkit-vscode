/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserGroup } from '../models/constants'
import globals from '../../shared/extensionGlobals'
import { extensionVersion } from '../../shared/vscode/env'

export class CodeWhispererUserGroupSettings {
    private _userGroup: UserGroup | undefined
    private _version: string | undefined

    public get userGroup(): UserGroup {
        if (!this._userGroup) {
            return this.determineUserGroupIfNeeded()
        } else {
            return this._userGroup
        }
    }

    // Visible for testing, DO NOT use on production
    public set userGroup(userGroup: UserGroup) {
        this._userGroup = userGroup
    }

    public get version(): string | undefined {
        return this._version
    }

    // for testing purpose
    public reset() {
        this._userGroup = undefined
        this._version = undefined
    }

    private determineUserGroupIfNeeded(): UserGroup {
        const userGroupMetadata = globals.globalState.get<{ group: UserGroup; version: string }>(
            'CODEWHISPERER_USER_GROUP'
        )
        // use the same userGroup setting if and only if they are the same version of plugin
        if (userGroupMetadata && userGroupMetadata.version && userGroupMetadata.version === extensionVersion) {
            this._userGroup = userGroupMetadata.group
            this._version = userGroupMetadata.version
            return userGroupMetadata.group
        }

        // otherwise, reassign group and reset the version
        this._version = extensionVersion
        this._userGroup = this.guessUserGroup()

        globals.globalState.tryUpdate('CODEWHISPERER_USER_GROUP', {
            group: this._userGroup,
            version: this._version,
        })

        return this._userGroup
    }

    private guessUserGroup(): UserGroup {
        return UserGroup.Control
    }

    static #instance: CodeWhispererUserGroupSettings | undefined

    public static get instance() {
        return (this.#instance ??= new CodeWhispererUserGroupSettings())
    }

    public static getUserGroup() {
        return CodeWhispererUserGroupSettings.instance.userGroup
    }
}
