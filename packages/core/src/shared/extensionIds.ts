/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// eslint-disable-next-line @typescript-eslint/naming-convention
export const VSCODE_REMOTE_SSH_EXTENSION = {
    vscode: {
        id: 'ms-vscode-remote.remote-ssh',
        minVersion: '0.74.0',
    },
    cursor: {
        id: 'anysphere.remote-ssh',
        minVersion: '1.0.2',
    },
} as const

/**
 * Extension IDs that don't require runtime vscode access.
 * Safe to import in test environments.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const VSCODE_EXTENSION_ID_CONSTANTS = {
    awstoolkit: 'amazonwebservices.aws-toolkit-vscode',
    amazonq: 'amazonwebservices.amazon-q-vscode',
    python: 'ms-python.python',
    // python depends on jupyter plugin
    jupyter: 'ms-toolsai.jupyter',
    yaml: 'redhat.vscode-yaml',
    go: 'golang.go',
    java: 'redhat.java',
    javadebug: 'vscjava.vscode-java-debug',
    dotnet: 'ms-dotnettools.csdevkit',
    git: 'vscode.git',
    // default to VSCode in test environment
    remotessh: VSCODE_REMOTE_SSH_EXTENSION.vscode,
} as const
