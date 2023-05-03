/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// eslint-disable-next-line @typescript-eslint/naming-convention
export const VSCODE_EXTENSION_ID = {
    awstoolkit: 'amazonwebservices.aws-toolkit-vscode',
    python: 'ms-python.python',
    // python depends on jupyter plugin
    jupyter: 'ms-toolsai.jupyter',
    yaml: 'redhat.vscode-yaml',
    go: 'golang.go',
    java: 'redhat.java',
    javadebug: 'vscjava.vscode-java-debug',
    git: 'vscode.git',
    remotessh: 'ms-vscode-remote.remote-ssh',
}

export const vscodeExtensionMinVersion = {
    remotessh: '0.74.0',
}

/**
 * Version of the .vsix produced by package.ts with the --debug option.
 */
export const extensionAlphaVersion = '1.99.0-SNAPSHOT'
