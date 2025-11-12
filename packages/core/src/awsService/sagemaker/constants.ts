/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const ConnectFromRemoteWorkspaceMessage =
    'Unable to establish new remote connection. Your last active VS Code window is connected to a remote workspace. To open a new SageMaker Studio connection, select your local VS Code window and try again.'

export const InstanceTypeError = 'InstanceTypeError'

export const InstanceTypeMinimum = 'ml.t3.large'

export const InstanceTypeInsufficientMemory: Record<string, string> = {
    'ml.t3.medium': 'ml.t3.large',
    'ml.c7i.large': 'ml.c7i.xlarge',
    'ml.c6i.large': 'ml.c6i.xlarge',
    'ml.c6id.large': 'ml.c6id.xlarge',
    'ml.c5.large': 'ml.c5.xlarge',
}

// Remote access constants
export const RemoteAccess = {
    ENABLED: 'ENABLED',
    DISABLED: 'DISABLED',
} as const

export const SpaceStatus = {
    RUNNING: 'Running',
    STOPPED: 'Stopped',
    STARTING: 'Starting',
    STOPPING: 'Stopping',
} as const

export const InstanceTypeInsufficientMemoryMessage = (
    spaceName: string,
    chosenInstanceType: string,
    recommendedInstanceType: string
) => {
    return `Unable to create app for [${spaceName}] because instanceType [${chosenInstanceType}] is not supported for remote access enabled spaces. Use instanceType with at least 8 GiB memory. Would you like to start your space with instanceType [${recommendedInstanceType}]?`
}

export const InstanceTypeNotSelectedMessage = (spaceName: string) => {
    return `No instanceType specified for [${spaceName}]. ${InstanceTypeMinimum} is the default instance type, which meets minimum 8 GiB memory requirements for remote access. Continuing will start your space with instanceType [${InstanceTypeMinimum}] and remotely connect.`
}

export const RemoteAccessRequiredMessage =
    'This space requires remote access to be enabled.\nWould you like to restart the space and connect?\nAny unsaved work will be lost.'

// SSH Configuration Error Messages
export const SshConfigUpdateDeclinedMessage = (configHostName: string, configPath: string) =>
    `SSH configuration has an outdated ${configHostName} section. Fix your ${configPath} file manually to enable remote connections.`

export const SshConfigOpenedForEditMessage = () =>
    `SSH configuration file opened for editing. Fix the issue and try connecting again.`

export const SshConfigSyntaxErrorMessage = (configPath: string) =>
    `SSH configuration has syntax errors in your ${configPath} file. Fix the configuration manually to enable remote connection.`

export const SshConfigRemovalFailedMessage = (configHostName: string) =>
    `Failed to remove SSH config section for ${configHostName}`

export const SshConfigUpdateFailedMessage = (configPath: string, configHostName: string) =>
    `Failed to update SSH config section. Fix your ${configPath} file manually or remove the outdated ${configHostName} section.`
