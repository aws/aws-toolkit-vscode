/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../shared/errors'
import { localize } from '../shared/utilities/vsCodeUtils'
import { DBInstanceNode } from './explorer/dbInstanceNode'
import { DBResourceNode } from './explorer/dbResourceNode'

/**
 * Validates a cluster name for the CreateCluster API.
 * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/docdb/command/CreateDBClusterCommand/
 * @returns undefined if the name passes validation. Otherwise, an error message is returned.
 */
export function validateClusterName(name: string): string | undefined {
    if (name.length < 1 || name.length > 63) {
        return localize(
            'AWS.docdb.validateClusterName.error.invalidLength',
            'Cluster name must be between 1 and 63 characters long'
        )
    }

    if (!/^[a-z]/.test(name)) {
        return localize(
            'AWS.docdb.validateClusterName.error.invalidStart',
            'Cluster name must start with a lowercase letter'
        )
    }

    if (/-$/.test(name) || /--/.test(name)) {
        return localize(
            'AWS.docdb.validateClusterName.error.invalidEnd',
            'Cluster name cannot end with a hyphen or contain 2 consecutive hyphens'
        )
    }

    if (!/^[a-z0-9\-]+$/.test(name)) {
        return localize(
            'AWS.docdb.validateClusterName.error.invalidCharacters',
            'Cluster name must only contain lowercase letters, numbers, and hyphens'
        )
    }

    return undefined
}

/**
 * Validates a username
 * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/docdb/command/CreateDBClusterCommand/
 * @returns undefined if the name passes validation. Otherwise, an error message is returned.
 */
export function validateUsername(name: string): string | undefined {
    if (name.length < 1 || name.length > 63) {
        return localize(
            'AWS.docdb.validateUsername.error.invalidLength',
            'Username name must be between 1 and 63 characters long'
        )
    }

    if (!/^[a-zA-Z]/.test(name)) {
        return localize('AWS.docdb.validateUsername.error.invalidStart', 'Username must start with a letter')
    }

    if (!/^[a-zA-Z0-9]+$/.test(name)) {
        return localize(
            'AWS.docdb.validateUsername.error.invalidCharacters',
            'Username must only contain letters and numbers'
        )
    }

    return undefined
}

/**
 * Validates a password
 * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/docdb/command/CreateDBClusterCommand/
 * @returns undefined if validation passes. Otherwise, an error message is returned.
 */
export function validatePassword(password: string): string | undefined {
    if (password.length < 8 || password.length > 100) {
        return localize(
            'AWS.docdb.validatePassword.error.invalidLength',
            'Password must be between 8 and 100 characters long'
        )
    }

    if (/["\/\@]/.test(password) || !/^[ -~]*$/.test(password)) {
        return localize(
            'AWS.docdb.validatePassword.error.invalidCharacters',
            'Password must only contain printable ASCII characters (except for slash, double quotes and @ symbol)'
        )
    }

    return undefined
}

/**
 * Validates an instance name for the CreateInstance API.
 * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/docdb/command/CreateDBInstanceCommand/
 * @returns undefined if the name passes validation. Otherwise, an error message is returned.
 */
export function validateInstanceName(name: string): string | undefined {
    if (name.length < 1 || name.length > 63) {
        return localize(
            'AWS.docdb.validateInstanceName.error.invalidLength',
            'Instance name must be between 1 and 63 characters long'
        )
    }

    if (!/^[a-z]/.test(name)) {
        return localize(
            'AWS.docdb.validateInstanceName.error.invalidStart',
            'Instance name must start with a lowercase letter'
        )
    }

    if (/-$/.test(name) || /--/.test(name)) {
        return localize(
            'AWS.docdb.validateInstanceName.error.invalidEnd',
            'Instance name cannot end with a hyphen or contain 2 consecutive hyphens'
        )
    }

    if (!/^[a-z0-9\-]+$/.test(name)) {
        return localize(
            'AWS.docdb.validateInstanceName.error.invalidCharacters',
            'Instance name must only contain lowercase letters, numbers, and hyphens'
        )
    }

    return undefined
}

export function isSupportedGlobalInstanceClass(instanceClass: string) {
    return /(t3|t4g|r4)/.test(instanceClass) === false
}

export function assertNodeAvailable(node: DBResourceNode | undefined, action: string) {
    if (!node) {
        throw new ToolkitError(`No node specified for ${action}`)
    }

    if (!node.isAvailable) {
        if (node instanceof DBInstanceNode) {
            void vscode.window.showErrorMessage(localize('AWS.docdb.instanceStopped', 'Instance must be running'))
            throw new ToolkitError('Instance not running', { cancelled: true, code: 'docdbInstanceNotAvailable' })
        }

        void vscode.window.showErrorMessage(localize('AWS.docdb.clusterStopped', 'Cluster must be running'))
        throw new ToolkitError('Cluster not running', { cancelled: true, code: 'docdbClusterStopped' })
    }
}
